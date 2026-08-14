import { NextResponse } from "next/server";
import { runDealNotesLoop } from "@/lib/harness/loop";
import {
  buildSampleCall,
  SAMPLE_COMPANIES,
  SAMPLE_SLUG_PREFIX,
  sampleSlugFor,
} from "@/lib/sample-data";
import { deleteRun, listFullRuns, saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

function isSeeded(slug: string | undefined): boolean {
  return Boolean(slug?.startsWith(SAMPLE_SLUG_PREFIX));
}

/** GET → is the sample dataset currently loaded? */
export async function GET() {
  const runs = await listFullRuns(500);
  const seeded = runs.filter((r) => isSeeded(r.sampleSlug)).length;
  return NextResponse.json({
    loaded: seeded > 0,
    seeded,
    total: SAMPLE_COMPANIES.length,
  });
}

/**
 * POST → seed the sample dataset. Idempotent: companies already seeded are
 * skipped. Every call goes through the REAL notes loop and evidence gates —
 * sample data earns its "verified" labels the same way an upload does.
 */
export async function POST() {
  const existing = new Set(
    (await listFullRuns(500))
      .map((r) => r.sampleSlug)
      .filter((s): s is string => isSeeded(s)),
  );

  let created = 0;
  for (const [index, spec] of SAMPLE_COMPANIES.entries()) {
    const slug = sampleSlugFor(spec);
    if (existing.has(slug)) continue;
    const { transcript, notes } = buildSampleCall(spec);
    const run = await runDealNotesLoop({
      source: "sample",
      sampleSlug: slug,
      sourceLabel: spec.company,
      transcript,
      titleHint: spec.title,
      curatedNotes: notes,
    });
    // Spread the timeline so digest/notifications read naturally. Stagger
    // within the day by index so ordering is stable.
    const at = new Date(
      Date.now() - spec.daysAgo * 86_400_000 - index * 60_000,
    ).toISOString();
    await saveRun({ ...run, createdAt: at });
    created += 1;
  }

  return NextResponse.json({
    loaded: true,
    created,
    skipped: SAMPLE_COMPANIES.length - created,
    total: SAMPLE_COMPANIES.length,
  });
}

/** DELETE → remove every seeded sample run. Real runs are untouched. */
export async function DELETE() {
  const runs = await listFullRuns(500);
  let removed = 0;
  for (const run of runs) {
    if (!isSeeded(run.sampleSlug)) continue;
    await deleteRun(run.id);
    removed += 1;
  }
  return NextResponse.json({ loaded: false, removed });
}
