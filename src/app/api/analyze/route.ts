import { NextRequest, NextResponse } from "next/server";
import { resolveCallLink } from "@/lib/call-link";
import { config } from "@/lib/config";
import { runDealNotesLoop } from "@/lib/harness/loop";
import { ensurePyaiKey } from "@/lib/pyai-key";
import { pyaiUserMessage, runHearAndMaybeRecap } from "@/lib/pyai";
import { saveRunAudio } from "@/lib/store";

export const runtime = "nodejs";
/** Long uploads are chunked into parallel Hear jobs; allow headroom past one chunk. */
export const maxDuration = 600;

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_AUDIO = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "video/webm",
  "video/mp4",
]);

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}


export async function POST(request: NextRequest) {
  try {
    const key = await ensurePyaiKey();
    if (!key.configured) {
      return badRequest(
        "No PyAI key. Set PYAI_API_KEY or enable OPENGONG_AUTO_MINT_SANDBOX.",
        503,
      );
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        url?: string;
        customerName?: string;
      };
      const url = body.url?.trim();
      if (!url) return badRequest("url is required");

      // Accept whatever the recorder handed out — Fathom/Fireflies/Loom/Zoom
      // shares, Google Drive files, direct media. The resolver classifies the
      // link, strips contact/speaker names from the slug into a title, and
      // finds the media URL; failures come back as actionable messages.
      const resolved = await resolveCallLink(url);
      if (!resolved) {
        return badRequest(
          "Only public https links are supported (no localhost or private IPs)",
        );
      }
      if (!resolved.mediaUrl) {
        return badRequest(resolved.error ?? "Couldn't resolve this link to a recording");
      }
      const linkTitle = resolved.parsed.title;

      const { transcript, recap, callId, hearPath } = await runHearAndMaybeRecap(
        {
          mode: "url",
          audioUrl: resolved.mediaUrl,
          customerName: body.customerName || linkTitle || undefined,
        },
      );

      const run = await runDealNotesLoop({
        source: "url",
        // The clean title (names, not tokens) is the label; raw URL only as
        // a last resort.
        sourceLabel: (linkTitle ?? `${resolved.parsed.provider}: ${url}`).slice(0, 120),
        transcript,
        titleHint: body.customerName || linkTitle || "Call from URL",
        recap,
        pyaiCallId: callId,
      });

      return NextResponse.json({
        id: run.id,
        status: run.status,
        hearPath,
        pyaiCallId: callId,
        recapStatus: recap?.status ?? null,
        keySource: key.source,
      });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return badRequest(
        "Upload too large or incomplete. Max file size is 100MB.",
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return badRequest("file is required");
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return badRequest("file must be between 1 byte and 100MB");
    }
    if (file.type && !ALLOWED_AUDIO.has(file.type)) {
      return badRequest(`Unsupported content type: ${file.type}`);
    }

    const customerName =
      typeof form.get("customerName") === "string"
        ? String(form.get("customerName"))
        : undefined;

    const audioBytes = Buffer.from(await file.arrayBuffer());
    const replay = new File([audioBytes], file.name || "upload", {
      type: file.type || "application/octet-stream",
    });

    const { transcript, recap, callId, hearPath } = await runHearAndMaybeRecap({
      mode: "upload",
      file: replay,
      filename: file.name || "upload",
      customerName,
    });

    const run = await runDealNotesLoop({
      source: "upload",
      sourceLabel: file.name || "Uploaded call",
      transcript,
      titleHint: customerName || file.name || "Uploaded call",
      recap,
      pyaiCallId: callId,
    });

    await saveRunAudio(
      run.id,
      audioBytes,
      file.type || "application/octet-stream",
    );

    return NextResponse.json({
      id: run.id,
      status: run.status,
      hearPath,
      pyaiCallId: callId,
      recapStatus: recap?.status ?? null,
      keySource: key.source,
      deadlineMs: config.deadlineMs,
    });
  } catch (error) {
    const mapped = pyaiUserMessage(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
