import { NextRequest, NextResponse } from "next/server";
import { runDealNotesLoop } from "@/lib/harness/loop";
import { loadSample } from "@/lib/samples";

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

    return NextResponse.json({ id: run.id, status: run.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Demo failed";
    const status = message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
