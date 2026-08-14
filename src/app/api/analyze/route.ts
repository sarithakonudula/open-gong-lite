import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { runDealNotesLoop } from "@/lib/harness/loop";
import { ensurePyaiKey } from "@/lib/pyai-key";
import { pyaiUserMessage, runHearAndMaybeRecap } from "@/lib/pyai";
import { saveRunAudio } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

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

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (host === "::1" || host.startsWith("[") || host.includes(":")) return true;
  return false;
}

function isHttpsAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (isBlockedHost(parsed.hostname)) return false;
    return true;
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
        return badRequest(
          "Only public https audio URLs are supported (no localhost or private IPs)",
        );
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
