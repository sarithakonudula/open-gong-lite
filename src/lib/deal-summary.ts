// Deal summary — the story of ALL of a company's calls, not just the newest.
//
// Same contract as the rest of the product: the model never introduces facts.
// It receives only gate-passed claims (each one already backed by a transcript
// line) and can only point at them by ref id. Receipts are rebuilt server-side
// from the evidence table, so an invented fact has nothing to cite and any
// item without a valid ref is dropped before it renders. With no model
// available the same shape is assembled deterministically from the claims.

import { z } from "zod";
import type { CompanyGroup } from "@/lib/company";
import { callTimeLabel } from "@/lib/labels";
import {
  chatText,
  chatTextChain,
  parseJsonLoose,
  resolveAvailableLlm,
  type ChatFn,
} from "@/lib/llm";
import { isCategoryNote } from "@/lib/note-text";
import { isEmailableStatus, type RunRecord } from "@/lib/types";

/** Bump when the prompt or output shape changes — folded into the cache hash. */
export const DEAL_SUMMARY_PROMPT_VERSION = 1;

/** Newest claims kept when a long deal would overflow the prompt. */
const MAX_CLAIMS = 120;

/** When the call actually happened; upload time is the fallback. */
export function callDateForRun(run: RunRecord): string {
  return run.callDate ?? run.createdAt;
}

// ── Output shape ─────────────────────────────────────────────────────────────

export const DealSummaryItemSchema = z.object({
  text: z.string().min(1),
  /** Claim refs ("c7") this item is built from — resolved via `receipts`. */
  refs: z.array(z.string()).min(1),
});
export type DealSummaryItem = z.infer<typeof DealSummaryItemSchema>;

export const DealSummaryReceiptSchema = z.object({
  runId: z.string(),
  callTitle: z.string(),
  callDate: z.string(),
  /** "12:05" when the cited line carries a clock, else null. */
  timeLabel: z.string().nullable(),
  quote: z.string(),
});
export type DealSummaryReceipt = z.infer<typeof DealSummaryReceiptSchema>;

export const DealSummarySchema = z.object({
  schema: z.literal("opengong.deal-summary"),
  version: z.literal(1),
  companyKey: z.string(),
  displayName: z.string(),
  generatedAt: z.string(),
  generator: z.enum(["llm", "deterministic"]),
  /** Provider label when generator is "llm". */
  provider: z.string().optional(),
  callCount: z.number().int().nonnegative(),
  /** One sentence: where the deal stands today. */
  headline: z.string(),
  /** The arc across calls, oldest to newest. */
  narrative: z.array(DealSummaryItemSchema),
  /** Raised on an earlier call, addressed on a later one. */
  resolved: z.array(DealSummaryItemSchema),
  /** Unresolved next steps and objections as of the latest call. */
  open: z.array(DealSummaryItemSchema),
  risks: z.array(DealSummaryItemSchema),
  receipts: z.record(z.string(), DealSummaryReceiptSchema),
});
export type DealSummary = z.infer<typeof DealSummarySchema>;

// ── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceClaim = {
  ref: string;
  runId: string;
  /** 1-based position in the chronological call list. */
  callOrdinal: number;
  section: string;
  text: string;
  lineId: string;
  quote: string;
  timeLabel: string | null;
};

export type CompanyEvidence = {
  key: string;
  displayName: string;
  /** Chronological (oldest first) — the order the deal actually happened. */
  calls: Array<{
    runId: string;
    title: string;
    date: string;
    ordinal: number;
  }>;
  claims: EvidenceClaim[];
};

const CLAIM_SECTIONS = [
  "summary",
  "intent",
  "pain",
  "pricing",
  "competitors",
  "objections",
  "nextSteps",
] as const;

/**
 * Every gate-passed claim from every call in the cluster, oldest call first.
 * Category lines ("Pricing came up on the call.") carry nothing a section
 * header didn't already say, so they never enter the deal story.
 */
export function collectCompanyEvidence(group: CompanyGroup): CompanyEvidence {
  const chronological = [...group.runs]
    .filter((run) => run.notes)
    .sort((a, b) => callDateForRun(a).localeCompare(callDateForRun(b)));

  const calls = chronological.map((run, i) => ({
    runId: run.id,
    title: run.notes?.title ?? run.sourceLabel,
    date: callDateForRun(run),
    ordinal: i + 1,
  }));

  const claims: Omit<EvidenceClaim, "ref">[] = [];
  chronological.forEach((run, i) => {
    const notes = run.notes!;
    const lineById = new Map(run.transcript.map((l) => [l.id, l]));
    for (const section of CLAIM_SECTIONS) {
      for (const claim of notes[section]) {
        if (!isEmailableStatus(claim.status)) continue;
        if (isCategoryNote(claim.text)) continue;
        claims.push({
          runId: run.id,
          callOrdinal: i + 1,
          section,
          text: claim.text,
          lineId: claim.evidence.lineId,
          quote: claim.evidence.quote,
          timeLabel: callTimeLabel(lineById.get(claim.evidence.lineId)?.startMs),
        });
      }
    }
  });

  // A long deal keeps its newest claims — the oldest context goes first.
  const kept =
    claims.length > MAX_CLAIMS ? claims.slice(claims.length - MAX_CLAIMS) : claims;

  return {
    key: group.key,
    displayName: group.displayName,
    calls,
    claims: kept.map((claim, i) => ({ ...claim, ref: `c${i + 1}` })),
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function buildDealSummaryPrompt(ev: CompanyEvidence): {
  system: string;
  user: string;
} {
  const system = `You are OpenGong Lite's deal-summary writer. You receive verified, receipt-backed notes from every analyzed call with one company, in chronological order. Write the deal's story so a sales leader knows where it stands without reading the calls.
Return ONLY valid JSON matching this shape:
{
  "headline": string,
  "narrative": [{"text": string, "refs": ["c1"]}],
  "resolved": [{"text": string, "refs": ["c2", "c9"]}],
  "open":     [{"text": string, "refs": ["c7"]}],
  "risks":    [{"text": string, "refs": ["c4"]}]
}
Section meanings:
- headline: one sentence on where the deal stands today.
- narrative: 2-5 short paragraphs telling the arc across the calls, oldest to newest.
- resolved: concerns raised on an earlier call and addressed on a later one.
- open: unresolved next steps and objections as of the latest call.
- risks: threats grounded in the notes (stalls, competitors, pricing pushback).
Rules:
- Use ONLY the supplied claims. Never introduce facts, names, numbers, or dates that do not appear in them.
- Every item MUST cite at least one claim ref id (like "c7") in its refs array. Items without valid refs are discarded.
- "resolved" requires evidence from BOTH the raising call and the resolving call — cite both refs. If nothing was resolved across calls, return [].
- "open" and "risks" MUST be empty arrays when the calls never went there.
- Plain prose, no markdown, no emojis. Keep each item under 60 words.`;

  const callLines = ev.calls
    .map((c) => `Call ${c.ordinal} of ${ev.calls.length} · ${c.date.slice(0, 10)} · ${c.title}`)
    .join("\n");
  const claimLines = ev.claims
    .map(
      (c) =>
        `[${c.ref}] Call ${c.callOrdinal} · ${c.section}: "${c.text}" (quote: "${c.quote}")`,
    )
    .join("\n");
  const user = `Company: ${ev.displayName}

Calls (chronological):
${callLines}

Verified claims:
${claimLines}`;

  return { system, user };
}

// ── Parse + grounding gate ───────────────────────────────────────────────────

const LlmDealSummarySchema = z.object({
  headline: z.string().min(1),
  narrative: z.array(DealSummaryItemSchema).default([]),
  resolved: z.array(DealSummaryItemSchema).default([]),
  open: z.array(DealSummaryItemSchema).default([]),
  risks: z.array(DealSummaryItemSchema).default([]),
});

function buildReceipts(
  refs: Set<string>,
  ev: CompanyEvidence,
): DealSummary["receipts"] {
  const byRef = new Map(ev.claims.map((c) => [c.ref, c]));
  const titleByRun = new Map(ev.calls.map((c) => [c.runId, c.title]));
  const dateByRun = new Map(ev.calls.map((c) => [c.runId, c.date]));
  const receipts: DealSummary["receipts"] = {};
  for (const ref of refs) {
    const claim = byRef.get(ref);
    if (!claim) continue;
    receipts[ref] = {
      runId: claim.runId,
      callTitle: titleByRun.get(claim.runId) ?? "",
      callDate: dateByRun.get(claim.runId) ?? "",
      timeLabel: claim.timeLabel,
      quote: claim.quote,
    };
  }
  return receipts;
}

/**
 * Validate the model's answer and enforce grounding: refs the evidence table
 * doesn't know are filtered, items left with zero valid refs are dropped, and
 * an answer where everything drops is an error (the caller falls back).
 */
export function parseDealSummary(
  raw: unknown,
  ev: CompanyEvidence,
  meta: { generatedAt: string; provider?: string },
): DealSummary {
  const parsed = LlmDealSummarySchema.parse(raw);
  const known = new Set(ev.claims.map((c) => c.ref));
  const cited = new Set<string>();
  const gate = (items: DealSummaryItem[]): DealSummaryItem[] =>
    items
      .map((item) => ({
        text: item.text,
        refs: item.refs.filter((ref) => known.has(ref)),
      }))
      .filter((item) => item.refs.length > 0)
      .map((item) => {
        item.refs.forEach((ref) => cited.add(ref));
        return item;
      });

  const narrative = gate(parsed.narrative);
  const resolved = gate(parsed.resolved);
  const open = gate(parsed.open);
  const risks = gate(parsed.risks);
  if (
    narrative.length + resolved.length + open.length + risks.length ===
    0
  ) {
    throw new Error("Deal summary had no claim-backed items");
  }

  return {
    schema: "opengong.deal-summary",
    version: 1,
    companyKey: ev.key,
    displayName: ev.displayName,
    generatedAt: meta.generatedAt,
    generator: "llm",
    provider: meta.provider,
    callCount: ev.calls.length,
    headline: parsed.headline,
    narrative,
    resolved,
    open,
    risks,
    receipts: buildReceipts(cited, ev),
  };
}

// ── Deterministic fallback ───────────────────────────────────────────────────

/**
 * The same shape with no model: one arc line per call from its top summary
 * claim, and the latest call's open next steps and objections. Honest and
 * plain — the UI badges it so the reader knows a model didn't write it.
 */
export function deterministicDealSummary(
  ev: CompanyEvidence,
  now?: string,
): DealSummary {
  const cited = new Set<string>();
  const narrative: DealSummaryItem[] = [];
  for (const call of ev.calls) {
    const top = ev.claims.find(
      (c) => c.runId === call.runId && c.section === "summary",
    );
    if (!top) continue;
    cited.add(top.ref);
    narrative.push({
      text: `Call ${call.ordinal} of ${ev.calls.length} — ${call.title} (${call.date.slice(0, 10)}): ${top.text}`,
      refs: [top.ref],
    });
  }

  const latest = ev.calls[ev.calls.length - 1];
  const open: DealSummaryItem[] = latest
    ? ev.claims
        .filter(
          (c) =>
            c.runId === latest.runId &&
            (c.section === "nextSteps" || c.section === "objections"),
        )
        .map((c) => {
          cited.add(c.ref);
          return { text: c.text, refs: [c.ref] };
        })
    : [];

  const headline = latest
    ? `${ev.calls.length} call${ev.calls.length === 1 ? "" : "s"} on record — latest: ${latest.title} (${latest.date.slice(0, 10)}).`
    : "No analyzed calls on record yet.";

  return {
    schema: "opengong.deal-summary",
    version: 1,
    companyKey: ev.key,
    displayName: ev.displayName,
    generatedAt: now ?? new Date().toISOString(),
    generator: "deterministic",
    callCount: ev.calls.length,
    headline,
    narrative,
    resolved: [],
    open,
    risks: [],
    receipts: buildReceipts(cited, ev),
  };
}

// ── Generate ─────────────────────────────────────────────────────────────────

/**
 * LLM narrative when any model is available (configured chain, else a local
 * Ollama), deterministic summary otherwise. Never throws — a provider or
 * parse failure degrades to the deterministic shape instead of a broken page.
 */
export async function generateDealSummary(
  ev: CompanyEvidence,
  opts: { chat?: ChatFn; now?: string } = {},
): Promise<DealSummary> {
  const generatedAt = opts.now ?? new Date().toISOString();
  if (ev.claims.length === 0) return deterministicDealSummary(ev, generatedAt);
  const prompt = buildDealSummaryPrompt(ev);
  try {
    if (opts.chat) {
      const text = await opts.chat(prompt);
      return parseDealSummary(parseJsonLoose(text), ev, { generatedAt });
    }
    const target = await resolveAvailableLlm();
    if (!target) return deterministicDealSummary(ev, generatedAt);
    if (target.source === "ollama-local") {
      const text = await chatText({ ...prompt, target });
      return parseDealSummary(parseJsonLoose(text), ev, {
        generatedAt,
        provider: target.label,
      });
    }
    const { text, provider } = await chatTextChain(prompt);
    return parseDealSummary(parseJsonLoose(text), ev, {
      generatedAt,
      provider: provider.label,
    });
  } catch {
    return deterministicDealSummary(ev, generatedAt);
  }
}
