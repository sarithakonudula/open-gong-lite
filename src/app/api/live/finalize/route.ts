import { NextRequest, NextResponse } from "next/server";
import { runDealNotesLoop } from "@/lib/harness/loop";
import { loadSample } from "@/lib/samples";
import { TranscriptLineSchema } from "@/lib/types";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  sampleSlug: z.string().min(1).max(80).optional(),
  transcript: z.array(TranscriptLineSchema).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid body" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    let curatedNotes = null;
    let titleHint = body.title || "Live call";
    let sourceLabel = titleHint;

    if (body.sampleSlug) {
      const sample = await loadSample(body.sampleSlug);
      curatedNotes = sample.notes;
      // Only use curated notes when the full sample transcript was streamed.
      if (body.transcript.length < sample.transcript.length) {
        curatedNotes = null;
      }
      titleHint = body.title || sample.meta.title;
      sourceLabel = `Live · ${sample.meta.title}`;
    }

    const run = await runDealNotesLoop({
      source: "live",
      sourceLabel,
      transcript: body.transcript,
      titleHint,
      curatedNotes,
      forceDemoExtract: !curatedNotes,
    });

    return NextResponse.json({ id: run.id, status: run.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live finalize failed";
    const status = message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
