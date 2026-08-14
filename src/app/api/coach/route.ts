import { NextResponse } from "next/server";
import {
  buildRepProfile,
  CoachingInput,
  detectRepSpeaker,
  RepCoachingProfile,
  saveRepProfile,
} from "@/lib/coaching";
import {
  applyMethodologyVerdict,
  demoScorecardForRun,
  getMethodologyPack,
} from "@/lib/methodology";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";

export const runtime = "nodejs";

/**
 * GET — per-rep coaching profiles built from every scorecard we have:
 * demo verdicts on sample runs plus persisted LLM verdicts on live runs.
 * Profiles are also written to data/coaching/ so the trend survives.
 */
export async function GET() {
  const runs = await listFullRuns(200);
  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));

  const byRep = new Map<string, CoachingInput[]>();
  const displayName = new Map<string, string>();
  for (const run of runs) {
    if (run.transcript.length === 0) continue;

    // Stored LLM verdict wins; demo verdict covers sample runs keylessly.
    let card = null;
    if (run.methodology) {
      const pack = getMethodologyPack(run.methodology.packId);
      if (pack) {
        try {
          card = applyMethodologyVerdict(
            pack,
            run.transcript,
            run.methodology.verdict,
            { dealValueUsd: run.methodology.dealValueUsd },
          );
        } catch {
          card = null;
        }
      }
    }
    if (!card) card = demoScorecardForRun(run, titleToSlug);
    if (!card) continue;

    const rep = detectRepSpeaker(run.transcript);
    if (!rep) continue;
    // Case-insensitive merge: "maya" and "Maya" are one profile; the
    // first-seen spelling is kept as the display name.
    const key = rep.trim().toLowerCase();
    if (!displayName.has(key)) displayName.set(key, rep.trim());
    byRep.set(key, [
      ...(byRep.get(key) ?? []),
      {
        runId: run.id,
        at: run.createdAt,
        title: run.notes?.title ?? run.sourceLabel,
        card,
      },
    ]);
  }

  const profiles: RepCoachingProfile[] = [];
  for (const [key, inputs] of byRep) {
    const profile = buildRepProfile(displayName.get(key) ?? key, inputs);
    profiles.push(profile);
    try {
      await saveRepProfile(profile);
    } catch {
      // persistence is best-effort; the response still carries the profile
    }
  }

  profiles.sort((a, b) => b.calls.length - a.calls.length);
  return NextResponse.json({ profiles });
}
