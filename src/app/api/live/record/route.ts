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

export async function POST(request: NextRequest) {
  try {
    const key = await ensurePyaiKey();
    if (!key.configured) {
      return NextResponse.json(
        {
          error:
            "Mic live needs a PyAI key. Set PYAI_API_KEY or enable sandbox mint — or use the scripted live demo.",
        },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Recording must be between 1 byte and 25MB" },
        { status: 400 },
      );
    }

    const type = file.type || "audio/webm";
    if (type && !ALLOWED_AUDIO.has(type) && !type.startsWith("audio/")) {
      return NextResponse.json(
        { error: `Unsupported content type: ${type}` },
        { status: 400 },
      );
    }

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim().slice(0, 200)
        : "Live mic call";

    const filename =
      (typeof form.get("filename") === "string" &&
        String(form.get("filename")).slice(0, 120)) ||
      file.name ||
      "live-mic.webm";

    const { transcript, recap, callId, hearPath } = await runHearAndMaybeRecap({
      mode: "upload",
      file,
      filename,
      customerName: title,
      preferSync: true,
    });

    if (!transcript.length) {
      return NextResponse.json(
        { error: "No speech detected in the recording" },
        { status: 422 },
      );
    }

    const run = await runDealNotesLoop({
      source: "live",
      sourceLabel: `Live mic · ${title}`,
      transcript,
      titleHint: title,
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
      lines: transcript.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live mic finalize failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
