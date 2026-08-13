import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { runDealNotesLoop } from "@/lib/harness/loop";
import { loadSample, sampleAudioAbsolutePath } from "@/lib/samples";
import { saveRunAudio } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(_request: NextRequest, context: Ctx) {
  try {
    const { slug } = await context.params;
    const sample = await loadSample(slug);
    const run = await runDealNotesLoop({
      source: "sample",
      sourceLabel: sample.meta.title,
      transcript: sample.transcript,
      titleHint: sample.meta.title,
      // Prefer curated sample deal-intel; fall back to local extract.
      curatedNotes: sample.notes,
      forceDemoExtract: !sample.notes,
    });

    if (sample.meta.audioFile) {
      const bytes = await fs.readFile(
        sampleAudioAbsolutePath(sample.meta.audioFile),
      );
      const ext = sample.meta.audioFile.toLowerCase();
      const contentType = ext.endsWith(".wav")
        ? "audio/wav"
        : ext.endsWith(".mp3")
          ? "audio/mpeg"
          : "audio/mp4";
      await saveRunAudio(run.id, bytes, contentType);
    }

    return NextResponse.json({ id: run.id, status: run.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Demo failed";
    const status = message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
