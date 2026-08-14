// Management digest — the pipeline story for a sales leader, built only from
// gated material: verified claims, deterministic momentum, and the signal
// feed. Deterministic markdown first; an optional LLM paragraph can sit on
// top but never introduces facts (it only rephrases the bullet inputs).

import { DealAlert, DealSignalFeed } from "@/lib/deal-signals";
import { computeMomentum, MomentumResult } from "@/lib/momentum";
import { isEmailableStatus, RunRecord } from "@/lib/types";

export type DigestEntry = {
  company: string;
  latestRun: RunRecord;
  callCount: number;
  momentum: MomentumResult | null;
  /** Verified highlights with receipts. */
  highlights: Array<{ text: string; lineId: string }>;
  nextSteps: string[];
  openObjections: string[];
  riskAlerts: DealAlert[];
};

export type DigestTotals = {
  companies: number;
  calls: number;
  advancing: number;
  steady: number;
  stalling: number;
  atRisk: number;
  hotAlerts: number;
};

export type Digest = {
  schema: "opengong.management-digest";
  version: 1;
  generatedAt: string;
  totals: DigestTotals;
  entries: DigestEntry[];
  markdown: string;
};

/** Group runs per company (newest run wins), attach momentum + risks. */
export function buildDigestEntries(
  runs: RunRecord[],
  opts: {
    companyForRun: (run: RunRecord) => string;
    feedForCompany?: (company: string) => DealSignalFeed | null;
  },
): DigestEntry[] {
  const byCompany = new Map<string, RunRecord[]>();
  for (const run of runs) {
    if (!run.notes) continue;
    const company = opts.companyForRun(run);
    byCompany.set(company, [...(byCompany.get(company) ?? []), run]);
  }

  const entries: DigestEntry[] = [];
  for (const [company, group] of byCompany) {
    const sorted = [...group].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const latest = sorted[0]!;
    const notes = latest.notes!;
    const momentum = computeMomentum(notes);
    const verified = (claims: typeof notes.summary) =>
      claims.filter((c) => isEmailableStatus(c.status));
    const feed = opts.feedForCompany?.(company) ?? null;
    entries.push({
      company,
      latestRun: latest,
      callCount: sorted.length,
      momentum,
      highlights: verified(notes.summary)
        .slice(0, 2)
        .map((c) => ({ text: c.text, lineId: c.evidence.lineId })),
      nextSteps: verified(notes.nextSteps).map((c) => c.text),
      openObjections: verified(notes.objections).map((c) => c.text),
      riskAlerts: (feed?.alerts ?? []).filter(
        (a) => a.severity === "hot" || a.severity === "high",
      ),
    });
  }

  const rank: Record<string, number> = {
    at_risk: 0,
    stalling: 1,
    steady: 2,
    advancing: 3,
  };
  return entries.sort(
    (a, b) =>
      rank[a.momentum?.direction ?? "steady"]! -
      rank[b.momentum?.direction ?? "steady"]!,
  );
}

export function digestTotals(entries: DigestEntry[]): DigestTotals {
  const count = (d: string) =>
    entries.filter((e) => e.momentum?.direction === d).length;
  return {
    companies: entries.length,
    calls: entries.reduce((sum, e) => sum + e.callCount, 0),
    advancing: count("advancing"),
    steady: count("steady"),
    stalling: count("stalling"),
    atRisk: count("at_risk"),
    hotAlerts: entries.reduce(
      (sum, e) => sum + e.riskAlerts.filter((a) => a.severity === "hot").length,
      0,
    ),
  };
}

const DIRECTION_LABEL: Record<string, string> = {
  advancing: "🟢 Advancing",
  steady: "🟡 Steady",
  stalling: "🟠 Stalling",
  at_risk: "🔴 At risk",
};

export function renderDigestMarkdown(
  entries: DigestEntry[],
  totals: DigestTotals,
  generatedAt: string,
): string {
  const lines: string[] = [];
  lines.push(`# Pipeline digest — ${generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `${totals.companies} active deal${totals.companies === 1 ? "" : "s"} across ${totals.calls} analyzed call${totals.calls === 1 ? "" : "s"} · ` +
      `🟢 ${totals.advancing} advancing · 🟡 ${totals.steady} steady · 🟠 ${totals.stalling} stalling · 🔴 ${totals.atRisk} at risk` +
      (totals.hotAlerts ? ` · 🔥 ${totals.hotAlerts} hot alert${totals.hotAlerts === 1 ? "" : "s"}` : ""),
  );
  for (const e of entries) {
    const m = e.momentum;
    lines.push("");
    lines.push(
      `## ${e.company} — ${m ? `${DIRECTION_LABEL[m.direction]} (${m.score}/100)` : "no score"}`,
    );
    lines.push(
      `Latest call: ${e.latestRun.notes?.title ?? e.latestRun.sourceLabel} · ${e.latestRun.createdAt.slice(0, 10)} · ${e.callCount} call${e.callCount === 1 ? "" : "s"} on record`,
    );
    for (const h of e.highlights) {
      lines.push(`- ${h.text} [${h.lineId}]`);
    }
    if (e.openObjections.length > 0) {
      lines.push(`- ⚠️ Open objections: ${e.openObjections.join(" · ")}`);
    }
    for (const a of e.riskAlerts) {
      lines.push(`- 🚨 ${a.title} — ${a.play}`);
    }
    if (e.nextSteps.length > 0) {
      lines.push(`- ➡️ Next: ${e.nextSteps.join(" · ")}`);
    }
  }
  lines.push("");
  lines.push(
    "_Every bullet above traces to a verified transcript line or a rule-evaluated signal. Unproven claims never enter this digest._",
  );
  return lines.join("\n");
}

export function buildDigest(
  runs: RunRecord[],
  opts: {
    companyForRun: (run: RunRecord) => string;
    feedForCompany?: (company: string) => DealSignalFeed | null;
    now?: string;
  },
): Digest {
  const generatedAt = opts.now ?? new Date().toISOString();
  const entries = buildDigestEntries(runs, opts);
  const totals = digestTotals(entries);
  return {
    schema: "opengong.management-digest",
    version: 1,
    generatedAt,
    totals,
    entries,
    markdown: renderDigestMarkdown(entries, totals, generatedAt),
  };
}

// ── Public projection (what the API may serialize) ──────────────────────────
// Full RunRecords carry shareToken (the secret behind public /share links)
// and complete transcripts. Neither belongs in an API response — the digest
// UI only needs id/createdAt/title. Never serialize Digest directly.

export type PublicDigestEntry = Omit<DigestEntry, "latestRun"> & {
  latestRun: { id: string; createdAt: string; title: string };
};

export type PublicDigest = Omit<Digest, "entries"> & {
  entries: PublicDigestEntry[];
};

export function toPublicDigest(digest: Digest): PublicDigest {
  return {
    ...digest,
    entries: digest.entries.map((e) => ({
      ...e,
      latestRun: {
        id: e.latestRun.id,
        createdAt: e.latestRun.createdAt,
        title: e.latestRun.notes?.title ?? e.latestRun.sourceLabel,
      },
    })),
  };
}
