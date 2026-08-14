// In-app notification feed — derived, not stored. Real events come straight
// from run rows and coaching profiles (deterministic ids, so read-state can
// live client-side); fixture-only events are appended by the page and carry
// sample: true.

import type { RecordingRow } from "@/lib/recording-row";

export type NotificationKind =
  | "risk"
  | "digest"
  | "positive"
  | "processed"
  | "highscore"
  | "template";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** ISO timestamp the event is anchored to. */
  at: string;
  href?: string;
  /** True when the item is fixture data, not a pipeline event. */
  sample?: boolean;
};

export type RepScoreSummary = {
  rep: string;
  calls: Array<{ score: number; at: string; runId: string }>;
};

const HIGH_SCORE_FLOOR = 85;

export function deriveNotifications(
  rows: RecordingRow[],
  profiles: RepScoreSummary[] = [],
): AppNotification[] {
  const out: AppNotification[] = [];

  for (const row of rows) {
    out.push({
      id: `processed:${row.id}`,
      kind: "processed",
      title: "New recording uploaded",
      detail: `"${row.title}" with ${row.company} was processed${
        row.score != null ? ` and scored ${row.score}%` : ""
      }.`,
      at: row.createdAt,
      href: `/runs/${row.id}`,
    });

    if (row.dealState === "At Risk") {
      out.push({
        id: `risk:${row.id}`,
        kind: "risk",
        title: `${row.company} flagged as at risk`,
        detail: row.pullQuote
          ? `Deal signals turned negative on "${row.title}" — "${row.pullQuote}"`
          : `Deal signals turned negative on "${row.title}".`,
        at: row.createdAt,
        href: `/runs/${row.id}`,
      });
    }

    if (row.dealState === "Positive") {
      out.push({
        id: `positive:${row.id}`,
        kind: "positive",
        title: `${row.company} marked Positive`,
        detail: row.pullQuote
          ? `"${row.pullQuote}" — from "${row.title}".`
          : `Verified deal signals on "${row.title}" are advancing.`,
        at: row.createdAt,
        href: `/runs/${row.id}`,
      });
    }
  }

  for (const profile of profiles) {
    const latest = profile.calls[profile.calls.length - 1];
    if (!latest || latest.score < HIGH_SCORE_FLOOR) continue;
    out.push({
      id: `highscore:${profile.rep}:${latest.runId}`,
      kind: "highscore",
      title: `${profile.rep} hit a new high score`,
      detail: `Scored ${latest.score}% on their latest call — top of the current range.`,
      at: latest.at,
      href: "/reps",
    });
  }

  out.sort((a, b) => b.at.localeCompare(a.at));
  return out;
}
