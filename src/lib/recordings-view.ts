// View-model for the electron UI — deterministic mappings from gated run
// data onto what the screens show. No new judgment happens here: score is
// the momentum/coverage number we already compute, tags come from which
// gated sections have verified claims, quotes are evidence quotes. Pure and
// unit-tested; the API routes are thin wrappers.

import { CallKind, detectCallKind, KIND_LABEL } from "@/lib/call-kind";
import { DigestEntry } from "@/lib/digest";
import { computeMomentum } from "@/lib/momentum";
import { RepCoachingProfile } from "@/lib/coaching";
import { isEmailableStatus, RunRecord } from "@/lib/types";

export type DealState = "Positive" | "Neutral" | "At Risk";

export type RecordingRow = {
  id: string;
  title: string;
  company: string;
  /** A verified quote from the call — receipts, not marketing copy. */
  quote: string | null;
  tags: string[];
  date: string;
  /** Momentum for sales calls; receipt-coverage % otherwise. */
  score: number;
  scoreBasis: "momentum" | "coverage";
  dealState: DealState;
  callKind: CallKind;
  status: RunRecord["status"];
  durationLabel: string | null;
  /** True for demo/sample runs — the UI tags these visibly. */
  isSample: boolean;
};

export function dealStateFor(
  kind: CallKind,
  direction: string | null,
): DealState {
  if (kind !== "sales" || !direction) return "Neutral";
  if (direction === "advancing") return "Positive";
  if (direction === "at_risk") return "At Risk";
  return "Neutral";
}

export function tagsFor(run: RunRecord, kind: CallKind): string[] {
  const notes = run.notes;
  if (!notes) return [];
  const verified = (claims: typeof notes.summary) =>
    claims.filter((c) => isEmailableStatus(c.status));
  const tags: string[] = [];
  if (verified(notes.pricing ?? []).length > 0) tags.push("pricing");
  if (verified(notes.competitors ?? []).length > 0) tags.push("competitor");
  if (verified(notes.objections).length > 0) tags.push("objection");
  if (verified(notes.nextSteps).length > 0) tags.push("next steps");
  if (verified(notes.pain ?? []).length > 0) tags.push("pain point");
  tags.push(verified(notes.intent).length > 0 ? "high intent" : "low intent");
  if (kind !== "sales") tags.unshift(KIND_LABEL[kind].toLowerCase());
  return tags.slice(0, 3);
}

export function toRecordingRow(
  run: RunRecord,
  companyForRun: (run: RunRecord) => string,
): RecordingRow {
  const kind = detectCallKind(run.transcript).kind;
  const notes = run.notes;
  const momentum = notes && kind === "sales" ? computeMomentum(notes) : null;
  const coverage = notes?.coverage?.ratio ?? 0;
  const verifiedQuote =
    notes?.summary.find((c) => isEmailableStatus(c.status))?.evidence.quote ??
    notes?.intent.find((c) => isEmailableStatus(c.status))?.evidence.quote ??
    null;
  const lastLine = run.transcript[run.transcript.length - 1];
  const durationLabel =
    lastLine?.endMs != null
      ? `${Math.max(1, Math.round(lastLine.endMs / 60000))} min`
      : null;
  return {
    id: run.id,
    title: notes?.title ?? run.sourceLabel,
    company: companyForRun(run),
    quote: verifiedQuote,
    tags: tagsFor(run, kind),
    date: run.createdAt,
    score: momentum ? momentum.score : Math.round(coverage * 100),
    scoreBasis: momentum ? "momentum" : "coverage",
    dealState: dealStateFor(kind, momentum?.direction ?? null),
    callKind: kind,
    status: run.status,
    durationLabel,
    isSample: run.source === "sample",
  };
}

// ── Notifications feed (composed from real state, newest first) ─────────────

export type NotificationItem = {
  id: string;
  kind: "risk" | "coaching" | "positive" | "recording" | "performer" | "template";
  title: string;
  body: string;
  at: string;
  href: string | null;
};

export function composeNotifications(input: {
  rows: RecordingRow[];
  digestEntries: Array<
    Pick<DigestEntry, "company" | "riskAlerts"> & {
      momentum: { score: number; direction: string } | null;
      latestRunId: string;
    }
  >;
  profiles: Array<
    Pick<RepCoachingProfile, "rep" | "calls" | "focus" | "scoreTrend">
  >;
  templateTitles: string[];
  now?: string;
}): NotificationItem[] {
  const items: NotificationItem[] = [];

  for (const e of input.digestEntries) {
    const hot = e.riskAlerts[0];
    if (e.momentum?.direction === "at_risk" || hot) {
      items.push({
        id: `risk:${e.company}`,
        kind: "risk",
        title: `${e.company} flagged as at risk`,
        body: hot
          ? `${hot.title} — ${hot.detail}`
          : `Deal momentum dropped to ${e.momentum?.score}/100 on the latest call.`,
        at: input.rows.find((r) => r.id === e.latestRunId)?.date ?? "",
        href: `/recordings/${e.latestRunId}`,
      });
    }
    if (e.momentum?.direction === "advancing") {
      items.push({
        id: `positive:${e.company}`,
        kind: "positive",
        title: `${e.company} marked "Positive"`,
        body: `Momentum ${e.momentum.score}/100 on the latest call — verified next step on record.`,
        at: input.rows.find((r) => r.id === e.latestRunId)?.date ?? "",
        href: `/recordings/${e.latestRunId}`,
      });
    }
  }

  for (const row of input.rows.slice(0, 3)) {
    items.push({
      id: `rec:${row.id}`,
      kind: "recording",
      title: "New recording processed",
      body: `"${row.title}" with ${row.company} scored ${row.score}% (${row.scoreBasis}).`,
      at: row.date,
      href: `/recordings/${row.id}`,
    });
  }

  const needsCoaching = input.profiles.filter((p) => p.focus.length > 0);
  if (needsCoaching.length > 0) {
    items.push({
      id: "coaching:digest",
      kind: "coaching",
      title: "Coaching digest is ready",
      body: `${needsCoaching.map((p) => p.rep).join(" and ")} ${needsCoaching.length === 1 ? "has" : "have"} new coaching focus areas.`,
      at: input.rows[0]?.date ?? "",
      href: "/reps",
    });
  }
  const improver = input.profiles.find((p) => (p.scoreTrend ?? 0) > 0);
  if (improver) {
    const latest = improver.calls[improver.calls.length - 1];
    items.push({
      id: `performer:${improver.rep}`,
      kind: "performer",
      title: `${improver.rep} is trending up`,
      body: `Coaching score reached ${latest?.score}/100 (+${improver.scoreTrend} vs the previous call).`,
      at: input.rows[0]?.date ?? "",
      href: "/reps",
    });
  }

  const template = input.templateTitles[0];
  if (template) {
    items.push({
      id: `template:${template}`,
      kind: "template",
      title: "Template library available",
      body: `${input.templateTitles.length} routed follow-up templates including "${template}".`,
      at: "",
      href: "/templates",
    });
  }

  return items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

export function formatTimestamp(ms: number | undefined, lineId: string): string {
  if (ms == null) return lineId;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
