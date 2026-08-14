// Flow 4 — similar-deal playbooks: "deals like this closed when X; they
// died when Y", derived from history instead of generic sales advice.
//
// Receipts discipline, same as everywhere else:
// - Deal attributes come from gated claims and the transcript.
// - With HubSpot: patterns are computed deterministically from real
//   closed-won/lost deals; the optional LLM pass may only rephrase — any
//   insight referencing a deal that isn't in the input set is DROPPED.
// - Without HubSpot: patterns are mined from your own analyzed calls and
//   labeled as such ("from analyzed calls, not closed CRM deals").

import { computeMomentum } from "@/lib/momentum";
import { isEmailableStatus, RunRecord } from "@/lib/types";

// ── Attributes of the current deal (deterministic, from gated data) ─────────

export type DealAttributes = {
  company: string;
  industry: string | null;
  dealValueUsd: number | null;
  /** Verified requirement/pain statements from the call. */
  requirements: string[];
  competitors: string[];
};

const INDUSTRY_MARKERS: Array<[string, RegExp]> = [
  ["dental", /\b(dental|dentist|orthodont|clinic|practice|patients?|hygienist)\b/i],
  ["healthcare", /\b(health(care)?|hospital|medical|physician|hipaa)\b/i],
  ["financial services", /\b(bank(ing)?|lender|loans?|nbfc|fintech|credit union)\b/i],
  ["real estate", /\b(real estate|property|listings?|brokerage|tenants?)\b/i],
  ["software", /\b(saas|software|api|devops|engineering team)\b/i],
  ["retail", /\b(retail|store(front)?|e-?commerce|shoppers?)\b/i],
  ["logistics", /\b(logistics|fleet|shipping|warehouse|delivery)\b/i],
];

export function detectIndustry(text: string): string | null {
  let best: { name: string; hits: number } | null = null;
  for (const [name, pattern] of INDUSTRY_MARKERS) {
    const hits = (text.match(new RegExp(pattern.source, "gi")) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { name, hits };
  }
  return best?.name ?? null;
}

export function extractDealAttributes(
  run: RunRecord,
  company: string,
): DealAttributes {
  const notes = run.notes;
  const verified = (claims: NonNullable<typeof notes>["summary"]) =>
    (claims ?? []).filter((c) => isEmailableStatus(c.status));
  const transcriptText = run.transcript.map((l) => l.text).join("\n");
  return {
    company,
    industry: detectIndustry(transcriptText),
    dealValueUsd: run.methodology?.dealValueUsd ?? null,
    requirements: notes
      ? [...verified(notes.pain ?? []), ...verified(notes.nextSteps)].map((c) => c.text).slice(0, 6)
      : [],
    competitors: notes ? verified(notes.competitors ?? []).map((c) => c.text).slice(0, 3) : [],
  };
}

// ── Similarity over historical deals ────────────────────────────────────────

export type HistoricalDeal = {
  id: string;
  name: string;
  amount: number | null;
  won: boolean;
  stage: string | null;
};

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4),
  );
}

/** Name/industry token overlap + same order-of-magnitude deal size. */
export function similarityScore(attrs: DealAttributes, deal: HistoricalDeal): number {
  const dealTokens = tokens(deal.name);
  let score = 0;
  for (const t of tokens(`${attrs.company} ${attrs.industry ?? ""}`)) {
    if (dealTokens.has(t)) score += 2;
  }
  if (attrs.industry && dealTokens.has(attrs.industry.split(" ")[0]!)) score += 2;
  if (
    attrs.dealValueUsd != null &&
    deal.amount != null &&
    deal.amount > 0 &&
    Math.abs(Math.log10(deal.amount) - Math.log10(Math.max(1, attrs.dealValueUsd))) <= 0.5
  ) {
    score += 1;
  }
  return score;
}

export function rankSimilarDeals(
  attrs: DealAttributes,
  deals: HistoricalDeal[],
  perBucket = 5,
): { won: HistoricalDeal[]; lost: HistoricalDeal[] } {
  const ranked = [...deals].sort(
    (a, b) => similarityScore(attrs, b) - similarityScore(attrs, a),
  );
  return {
    won: ranked.filter((d) => d.won).slice(0, perBucket),
    lost: ranked.filter((d) => !d.won).slice(0, perBucket),
  };
}

// ── Playbook shapes ─────────────────────────────────────────────────────────

export type PlaybookInsight = {
  text: string;
  /** Names of the deals/calls this insight stands on — the receipts. */
  refs: string[];
};

export type Playbook = {
  mode: "hubspot" | "local";
  attrs: DealAttributes;
  winPatterns: PlaybookInsight[];
  lossPatterns: PlaybookInsight[];
  recommendations: PlaybookInsight[];
  /** Honest label of what the history actually is. */
  basis: string;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** Deterministic playbook from real closed deals — stats, not stories. */
export function buildHubspotPlaybook(
  attrs: DealAttributes,
  won: HistoricalDeal[],
  lost: HistoricalDeal[],
): Playbook {
  const winPatterns: PlaybookInsight[] = [];
  const lossPatterns: PlaybookInsight[] = [];
  const recommendations: PlaybookInsight[] = [];

  if (won.length > 0) {
    const amounts = won.map((d) => d.amount).filter((a): a is number => a != null);
    const med = median(amounts);
    winPatterns.push({
      text: `${won.length} similar deal${won.length === 1 ? "" : "s"} closed won${med != null ? ` — median size $${med.toLocaleString()}` : ""}.`,
      refs: won.map((d) => d.name),
    });
    if (
      med != null &&
      attrs.dealValueUsd != null &&
      attrs.dealValueUsd > med * 2
    ) {
      recommendations.push({
        text: `This deal is sized well above the winning median ($${med.toLocaleString()}) — expect a longer approval chain than the comparable wins.`,
        refs: won.map((d) => d.name),
      });
    }
  }
  if (lost.length > 0) {
    lossPatterns.push({
      text: `${lost.length} similar deal${lost.length === 1 ? "" : "s"} closed lost — review what stalled them before repeating the pattern.`,
      refs: lost.map((d) => d.name),
    });
  }
  if (won.length + lost.length > 0) {
    const rate = Math.round((won.length / (won.length + lost.length)) * 100);
    recommendations.push({
      text: `Historical win rate on comparable deals: ${rate}% (${won.length} won / ${lost.length} lost).`,
      refs: [...won, ...lost].map((d) => d.name),
    });
  }

  return {
    mode: "hubspot",
    attrs,
    winPatterns,
    lossPatterns,
    recommendations,
    basis: `Closed deals from your HubSpot portal ranked by similarity (${won.length} won, ${lost.length} lost considered).`,
  };
}

// ── Keyless fallback: mine your own analyzed calls ──────────────────────────

export function buildLocalPlaybook(
  attrs: DealAttributes,
  runs: RunRecord[],
  companyForRun: (run: RunRecord) => string,
): Playbook {
  const winPatterns: PlaybookInsight[] = [];
  const lossPatterns: PlaybookInsight[] = [];
  const recommendations: PlaybookInsight[] = [];

  const advancing: string[] = [];
  const atRisk: string[] = [];
  let advancingWithNextStep = 0;
  let riskWithoutNextStep = 0;

  for (const run of runs) {
    if (!run.notes || companyForRun(run) === attrs.company) continue;
    const momentum = computeMomentum(run.notes);
    const title = run.notes.title ?? run.sourceLabel;
    const hasNextStep = run.notes.nextSteps.some((c) => isEmailableStatus(c.status));
    if (momentum.direction === "advancing") {
      advancing.push(title);
      if (hasNextStep) advancingWithNextStep += 1;
    }
    if (momentum.direction === "at_risk" || momentum.direction === "stalling") {
      atRisk.push(title);
      if (!hasNextStep) riskWithoutNextStep += 1;
    }
  }

  if (advancing.length > 0) {
    winPatterns.push({
      text: `${advancing.length} analyzed call${advancing.length === 1 ? "" : "s"} left the deal advancing${advancingWithNextStep === advancing.length ? " — every one ended with a verified next step" : ""}.`,
      refs: advancing,
    });
  }
  if (atRisk.length > 0) {
    lossPatterns.push({
      text: `${atRisk.length} call${atRisk.length === 1 ? "" : "s"} left deals stalling or at risk${riskWithoutNextStep > 0 ? ` — ${riskWithoutNextStep} had no verified next step on record` : ""}.`,
      refs: atRisk,
    });
  }
  if (advancing.length > 0 || atRisk.length > 0) {
    recommendations.push({
      text: "Lock a concrete, dated next step before the call ends — it is the single pattern separating your advancing calls from the stalled ones.",
      refs: [...advancing, ...atRisk],
    });
  }
  if (attrs.competitors.length > 0) {
    recommendations.push({
      text: `A competitor is in this deal (${attrs.competitors[0]}). Your at-risk calls show competitor mentions going unanswered — address it head-on next call.`,
      refs: atRisk.length > 0 ? atRisk : advancing,
    });
  }

  return {
    mode: "local",
    attrs,
    winPatterns,
    lossPatterns,
    recommendations,
    basis:
      "Patterns from your analyzed calls (momentum outcomes), not closed CRM deals — connect HubSpot to mine real win/loss history.",
  };
}

// ── Optional LLM polish, gated ──────────────────────────────────────────────

/**
 * The LLM may rephrase and prioritize but may not invent: every returned
 * insight must reference at least one known deal/call name, and unknown
 * references drop the whole insight. Returns the count it dropped so the
 * UI can say so instead of hiding it.
 */
export function gateSynthesizedInsights(
  raw: unknown,
  knownRefs: string[],
): { insights: PlaybookInsight[]; dropped: number } {
  const known = new Set(knownRefs.map((r) => r.toLowerCase()));
  const list = Array.isArray((raw as { insights?: unknown[] })?.insights)
    ? ((raw as { insights: unknown[] }).insights as Array<Record<string, unknown>>)
    : [];
  const insights: PlaybookInsight[] = [];
  let dropped = 0;
  for (const item of list) {
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const refs = Array.isArray(item.refs) ? item.refs.map(String) : [];
    const allKnown = refs.length > 0 && refs.every((r) => known.has(r.toLowerCase()));
    if (!text || !allKnown) {
      dropped += 1;
      continue;
    }
    insights.push({ text, refs });
  }
  return { insights, dropped };
}
