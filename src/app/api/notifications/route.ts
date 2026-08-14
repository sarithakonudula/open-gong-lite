import { NextResponse } from "next/server";
import { demoSignalFeedForRun } from "@/lib/deal-signals";
import { buildDigest } from "@/lib/digest";
import { composeNotifications, toRecordingRow } from "@/lib/recordings-view";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";
import { templateLibrary } from "@/lib/template-email";
import { RunRecord } from "@/lib/types";
import {
  applyMethodologyVerdict,
  demoScorecardForRun,
  getMethodologyPack,
} from "@/lib/methodology";
import {
  buildRepProfile,
  CoachingInput,
  detectRepSpeaker,
} from "@/lib/coaching";

export const runtime = "nodejs";

/** Notification feed composed from real state: risks, momentum, coaching. */
export async function GET() {
  const runs = await listFullRuns(100);
  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));
  const slugToCompany = Object.fromEntries(samples.map((s) => [s.slug, s.company]));
  const companyForRun = (run: RunRecord): string => {
    const slug =
      run.sampleSlug ||
      (run.source === "sample" ? titleToSlug[run.sourceLabel] : undefined);
    return (slug && slugToCompany[slug]) || run.crm?.company || run.sourceLabel;
  };

  const rows = runs
    .filter((r) => r.notes)
    .map((r) => toRecordingRow(r, companyForRun));

  const digest = buildDigest(runs, {
    companyForRun,
    feedForCompany: (company) => {
      for (const run of runs) {
        if (companyForRun(run) !== company) continue;
        const feed = demoSignalFeedForRun(run, titleToSlug);
        if (feed) return feed;
      }
      return null;
    },
  });

  // Coach profiles (same resolution as /api/coach, without persisting).
  const byRep = new Map<string, CoachingInput[]>();
  const displayName = new Map<string, string>();
  for (const run of runs) {
    if (run.transcript.length === 0) continue;
    let card = null;
    if (run.methodology) {
      const pack = getMethodologyPack(run.methodology.packId);
      if (pack) {
        try {
          card = applyMethodologyVerdict(pack, run.transcript, run.methodology.verdict, {
            dealValueUsd: run.methodology.dealValueUsd,
          });
        } catch {
          card = null;
        }
      }
    }
    if (!card) card = demoScorecardForRun(run, titleToSlug);
    if (!card) continue;
    const rep = detectRepSpeaker(run.transcript);
    if (!rep) continue;
    const key = rep.trim().toLowerCase();
    if (!displayName.has(key)) displayName.set(key, rep.trim());
    byRep.set(key, [
      ...(byRep.get(key) ?? []),
      { runId: run.id, at: run.createdAt, title: run.notes?.title ?? run.sourceLabel, card },
    ]);
  }
  const profiles = [...byRep.entries()].map(([key, inputs]) =>
    buildRepProfile(displayName.get(key) ?? key, inputs),
  );

  const notifications = composeNotifications({
    rows,
    digestEntries: digest.entries.map((e) => ({
      company: e.company,
      riskAlerts: e.riskAlerts,
      momentum: e.momentum
        ? { score: e.momentum.score, direction: e.momentum.direction }
        : null,
      latestRunId: e.latestRun.id,
    })),
    profiles,
    templateTitles: templateLibrary().map((t) => t.title),
  });

  return NextResponse.json({ notifications });
}
