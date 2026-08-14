import { NextResponse } from "next/server";
import { runDealNotesLoop } from "@/lib/harness/loop";
import {
  buildSampleCall,
  isSampleSlug,
  SAMPLE_CALLS,
  SAMPLE_DATASET,
  sampleMethodologyFor,
  sampleSlugFor,
} from "@/lib/sample-data";
import { deleteRun, listFullRuns, saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

function kindCounts(seededSlugs: string[]) {
  const bySlug = new Map(SAMPLE_CALLS.map((s) => [sampleSlugFor(s), s]));
  const counts = { sales: 0, customer_success: 0, support: 0 };
  for (const slug of seededSlugs) {
    const spec = bySlug.get(slug);
    if (!spec) continue;
    if (spec.stage === "support") counts.support += 1;
    else if (spec.stage === "customer_success") counts.customer_success += 1;
    else counts.sales += 1;
  }
  return counts;
}

/** GET → is the sample dataset currently loaded? */
export async function GET() {
  const runs = await listFullRuns(500);
  const seededSlugs = runs
    .map((r) => r.sampleSlug)
    .filter((s): s is string => isSampleSlug(s));
  const seeded = seededSlugs.length;
  return NextResponse.json({
    loaded: seeded > 0,
    seeded,
    total: SAMPLE_CALLS.length,
    companies: SAMPLE_DATASET.companies,
    kinds: kindCounts(seededSlugs),
    expected: {
      sales: SAMPLE_DATASET.sales,
      customer_success: SAMPLE_DATASET.customerSuccess,
      support: SAMPLE_DATASET.support,
    },
  });
}

/**
 * POST → seed the sample dataset. Idempotent: calls already seeded are
 * skipped. Every call goes through the REAL notes loop and evidence gates —
 * sample data earns its "verified" labels the same way an upload does.
 */
export async function POST() {
  const existing = new Set(
    (await listFullRuns(500))
      .map((r) => r.sampleSlug)
      .filter((s): s is string => isSampleSlug(s)),
  );

  let created = 0;
  for (const [index, spec] of SAMPLE_CALLS.entries()) {
    const slug = sampleSlugFor(spec);
    if (existing.has(slug)) continue;
    const { transcript, notes } = buildSampleCall(spec);
    const methodology = sampleMethodologyFor(spec, transcript);
    const run = await runDealNotesLoop({
      source: "sample",
      sampleSlug: slug,
      sourceLabel: spec.company,
      company: spec.company,
      transcript,
      titleHint: spec.title,
      curatedNotes: notes,
      skipRoutedFollowUp: true,
    });
    const at = new Date(
      Date.now() - spec.daysAgo * 86_400_000 - index * 60_000,
    ).toISOString();
    await saveRun({
      ...run,
      createdAt: at,
      callDate: at,
      company: spec.company,
      methodology: {
        packId: methodology.packId,
        dealValueUsd: methodology.dealValueUsd,
        scoredAt: methodology.scoredAt,
        verdict: methodology.verdict,
      },
    });
    created += 1;
  }

  return NextResponse.json({
    loaded: true,
    created,
    skipped: SAMPLE_CALLS.length - created,
    total: SAMPLE_CALLS.length,
    companies: SAMPLE_DATASET.companies,
  });
}

/** DELETE → remove every seeded sample run. Real runs are untouched. */
export async function DELETE() {
  const runs = await listFullRuns(500);
  let removed = 0;
  for (const run of runs) {
    if (!isSampleSlug(run.sampleSlug)) continue;
    await deleteRun(run.id);
    removed += 1;
  }
  return NextResponse.json({ loaded: false, removed });
}
