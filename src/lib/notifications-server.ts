// Server-side assembly of the notification feed — shared by the
// Notifications page and the /api/notifications endpoint (sidebar dot).

import { detectRepSpeaker } from "@/lib/coaching";
import { FIXTURE_NOTIFICATIONS } from "@/lib/fixtures/notifications";
import {
  applyMethodologyVerdict,
  demoScorecardForRun,
  getMethodologyPack,
} from "@/lib/methodology";
import {
  AppNotification,
  deriveNotifications,
  type RepScoreSummary,
} from "@/lib/notifications";
import { buildRowContext, toRecordingRow } from "@/lib/recording-row";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";
import type { RunRecord } from "@/lib/types";

/** Latest score per rep, the cheap slice of what /api/coach computes. */
function repScoreSummaries(
  runs: RunRecord[],
  titleToSlug: Record<string, string>,
): RepScoreSummary[] {
  const byRep = new Map<string, RepScoreSummary>();
  for (const run of [...runs].reverse()) {
    if (run.transcript.length === 0) continue;
    let score: number | null = null;
    if (run.methodology) {
      const pack = getMethodologyPack(run.methodology.packId);
      if (pack) {
        try {
          score = applyMethodologyVerdict(
            pack,
            run.transcript,
            run.methodology.verdict,
            { dealValueUsd: run.methodology.dealValueUsd },
          ).score;
        } catch {
          score = null;
        }
      }
    }
    if (score == null) {
      try {
        score = demoScorecardForRun(run, titleToSlug)?.score ?? null;
      } catch {
        score = null;
      }
    }
    if (score == null) continue;
    const rep = detectRepSpeaker(run.transcript);
    if (!rep) continue;
    const key = rep.trim().toLowerCase();
    const entry = byRep.get(key) ?? { rep: rep.trim(), calls: [] };
    entry.calls.push({ score, at: run.createdAt, runId: run.id });
    byRep.set(key, entry);
  }
  return [...byRep.values()];
}

export async function buildNotificationFeed(): Promise<AppNotification[]> {
  const [runs, samples] = await Promise.all([listFullRuns(200), listSamples()]);
  const index = buildRowContext(samples);
  const rows = runs.map((run) => toRecordingRow(run, index));
  const profiles = repScoreSummaries(runs, index.titleToSlug);
  return [...deriveNotifications(rows, profiles), ...FIXTURE_NOTIFICATIONS].sort(
    (a, b) => b.at.localeCompare(a.at),
  );
}
