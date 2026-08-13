import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { runDealNotesLoop } from "@/lib/harness/loop";
import { ensurePyaiKey } from "@/lib/pyai-key";
import { runHearAndMaybeRecap } from "@/lib/pyai";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
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

function isHttpsAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
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
      if (!isHttpsAudioUrl(url)) {
        return badRequest("Only https audio URLs are supported for Hear jobs");
      }

      const { transcript, recap, callId, hearPath } = await runHearAndMaybeRecap(
        {
          mode: "url",
          audioUrl: url,
          customerName: body.customerName,
        },
      );

      const run = await runDealNotesLoop({
        source: "url",
        sourceLabel: url.slice(0, 120),
        transcript,
        titleHint: body.customerName || "Call from URL",
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

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return badRequest("file is required");
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return badRequest("file must be between 1 byte and 25MB");
    }
    if (file.type && !ALLOWED_AUDIO.has(file.type)) {
      return badRequest(`Unsupported content type: ${file.type}`);
    }

    const customerName =
      typeof form.get("customerName") === "string"
        ? String(form.get("customerName"))
        : undefined;

    const { transcript, recap, callId, hearPath } = await runHearAndMaybeRecap({
      mode: "upload",
      file,
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
    const message =
      error instanceof Error ? error.message : "Analyze failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
