// Methodology coach — one self-contained module.
//
// An admin picks the sales methodology the team follows (MEDDIC, Sandler,
// SPIN, ... 14 packs embedded below, or a custom pack passed in); a call is
// scored trait-by-trait on the DiscoveryClaude 0-3 depth rubric
// (missing / surface / developing / mastery), every verdict carries verbatim
// evidence that runs through the same L7 quote-fidelity gate as deal notes,
// and unmet traits come back as coaching a rep can use.
//
// Deal-value calibration (the Sourav caveat): the scoring expectation varies
// with deal size. On a small deal a rep rightly spends less time, so deep
// qualification traits (champion building, paper process, competition
// mapping) are excluded from the score's denominator instead of dragging it
// down misleadingly. Traits carry a rigor level (core / standard / deep);
// deal bands (transactional / mid / enterprise) decide which rigor levels are
// scored. Out-of-band traits still render — as information, not judgment.
//
// Scoring rules follow DiscoveryClaude's protocol: don't reward activity,
// reward depth; mastery requires business-impact linkage; premature
// solutioning is flagged. Context flags preserve scoring-fairness nuance.

import { z } from "zod";
import { gateEvidenceQuote } from "@/lib/harness/gates";
import { EvidenceSchema, type TranscriptLine } from "@/lib/types";
import { config, hasLlmFallback } from "@/lib/config";

// ── Pack shapes ─────────────────────────────────────────────────────────────

export const RigorSchema = z.enum(["core", "standard", "deep"]);
export type Rigor = z.infer<typeof RigorSchema>;

export const MethodologyTraitSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  weight: z.number().int().min(1).max(5),
  rigor: RigorSchema,
  definition: z.string().min(1),
  classifying_questions: z.array(z.string().min(1)).min(1),
  met_signals: z.array(z.string()).default([]),
  miss_signals: z.array(z.string()).default([]),
  coaching: z.object({
    why_it_matters: z.string().min(1),
    next_move: z.string().min(1),
    example_line: z.string().min(1),
  }),
});
export type MethodologyTrait = z.infer<typeof MethodologyTraitSchema>;

export const MethodologyPackSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  origin: z.string().optional(),
  summary: z.string().min(1),
  motion: z.string().optional(),
  traits: z.array(MethodologyTraitSchema).min(3).max(12),
});
export type MethodologyPack = z.infer<typeof MethodologyPackSchema>;

// ── Deal bands (deal-value-aware scoring) ───────────────────────────────────

export type DealBand = {
  id: "transactional" | "mid" | "enterprise";
  label: string;
  /** Upper bound in USD; null = no ceiling. */
  maxUsd: number | null;
  /** Highest rigor level that is SCORED at this deal size. */
  rigor: Rigor;
};

export const DEAL_BANDS: DealBand[] = [
  { id: "transactional", label: "Transactional (< $5k)", maxUsd: 5_000, rigor: "core" },
  { id: "mid", label: "Mid-market ($5k-$50k)", maxUsd: 50_000, rigor: "standard" },
  { id: "enterprise", label: "Enterprise (>= $50k)", maxUsd: null, rigor: "deep" },
];

const RIGOR_ORDER: Record<Rigor, number> = { core: 0, standard: 1, deep: 2 };

export function resolveDealBand(dealValueUsd?: number | null): DealBand | null {
  if (dealValueUsd == null || !Number.isFinite(dealValueUsd) || dealValueUsd < 0) return null;
  for (const band of DEAL_BANDS) {
    if (band.maxUsd === null || dealValueUsd < band.maxUsd) return band;
  }
  return DEAL_BANDS[DEAL_BANDS.length - 1];
}

/**
 * Which traits count toward the score at this deal size. A band never leaves
 * fewer than MIN_SCORED_TRAITS in scope — packs whose core set is tiny expand
 * to the next rigor level rather than producing a degenerate score.
 */
export const MIN_SCORED_TRAITS = 3;

export function traitsInScope(
  pack: MethodologyPack,
  band: DealBand | null,
): Set<string> {
  if (!band) return new Set(pack.traits.map((t) => t.id));
  let ceiling = RIGOR_ORDER[band.rigor];
  for (; ceiling <= RIGOR_ORDER.deep; ceiling += 1) {
    const inScope = pack.traits.filter((t) => RIGOR_ORDER[t.rigor] <= ceiling);
    if (inScope.length >= Math.min(MIN_SCORED_TRAITS, pack.traits.length)) {
      return new Set(inScope.map((t) => t.id));
    }
  }
  return new Set(pack.traits.map((t) => t.id));
}

// ── Verdict shapes (DiscoveryClaude 0-3 depth rubric) ───────────────────────

export const DepthSchema = z.enum([
  "missing", // 0 — rep did not attempt this area
  "surface", // 1 — mentioned, no depth or follow-up
  "developing", // 2 — good attempt, partial discovery
  "mastery", // 3 — deep, multi-layered, business impact uncovered
  "not_applicable",
]);
export type Depth = z.infer<typeof DepthSchema>;

const DEPTH_POINTS: Record<Exclude<Depth, "not_applicable">, number> = {
  missing: 0,
  surface: 1,
  developing: 2,
  mastery: 3,
};

export const TraitVerdictSchema = z.object({
  id: z.string(),
  depth: DepthSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema).default([]),
  /** What was missing on THIS call. Empty string when depth is mastery. */
  gap: z.string().default(""),
});
export type TraitVerdict = z.infer<typeof TraitVerdictSchema>;

export const MethodologyVerdictSchema = z.object({
  callType: z.string().default("unknown"),
  overallNote: z.string().default(""),
  /** Scoring-fairness nuance, e.g. "premature_solutioning", "short_call". */
  contextFlags: z.array(z.string()).default([]),
  traits: z.array(TraitVerdictSchema).min(1),
});
export type MethodologyVerdict = z.infer<typeof MethodologyVerdictSchema>;

// ── Evidence gate integration (reuses the L7 chain from harness/gates) ──────

export type GatedEvidence = {
  lineId: string;
  quote: string;
  status: "verified" | "segment_corrected" | "uncorroborated";
};

export type GatedTraitVerdict = TraitVerdict & {
  gatedEvidence: GatedEvidence[];
  /** depth >= developing but no evidence survived the gate. */
  unverified: boolean;
  /** Effective depth after the unverified cap. */
  effectiveDepth: Depth;
};

function gateOne(
  evidence: { lineId: string; quote: string },
  transcript: TranscriptLine[],
): GatedEvidence {
  const r = gateEvidenceQuote(evidence.quote, evidence.lineId, transcript);
  const status =
    r.verdict === "match_exact" || r.verdict === "match_normalized"
      ? ("verified" as const)
      : r.verdict === "segment_corrected"
        ? ("segment_corrected" as const)
        : ("uncorroborated" as const);
  return {
    lineId: r.matchedLineId ?? evidence.lineId,
    quote: evidence.quote,
    status,
  };
}

export function gateTraitVerdicts(
  verdict: MethodologyVerdict,
  transcript: TranscriptLine[],
): GatedTraitVerdict[] {
  return verdict.traits.map((t) => {
    const gatedEvidence = t.evidence.map((e) => gateOne(e, transcript));
    const corroborated = gatedEvidence.some((e) => e.status !== "uncorroborated");
    const needsEvidence = t.depth === "developing" || t.depth === "mastery";
    const unverified = needsEvidence && !corroborated;
    // An unproven "mastery" cannot outscore a proven "surface".
    const effectiveDepth: Depth = unverified ? "surface" : t.depth;
    return { ...t, gatedEvidence, unverified, effectiveDepth };
  });
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export type ScoredTrait = {
  trait: MethodologyTrait;
  verdict: GatedTraitVerdict | null;
  inScope: boolean;
  /** 0-3 after the unverified cap; null when n/a, unscored, or out of scope. */
  points: number | null;
};

export type MethodologyScorecard = {
  pack: MethodologyPack;
  band: DealBand | null;
  dealValueUsd: number | null;
  /** 0-100 across in-scope, applicable traits. */
  score: number;
  callType: string;
  overallNote: string;
  contextFlags: string[];
  traits: ScoredTrait[];
  evidenceStats: { total: number; corroborated: number; unverifiedTraits: number };
};

export function scoreMethodology(
  pack: MethodologyPack,
  gated: GatedTraitVerdict[],
  verdict: MethodologyVerdict,
  opts: { dealValueUsd?: number | null } = {},
): MethodologyScorecard {
  const dealValueUsd = opts.dealValueUsd ?? null;
  const band = resolveDealBand(dealValueUsd);
  const scope = traitsInScope(pack, band);
  const byId = new Map(gated.map((t) => [t.id, t]));

  let num = 0;
  let den = 0;
  const traits: ScoredTrait[] = pack.traits.map((trait) => {
    const v = byId.get(trait.id) ?? null;
    const inScope = scope.has(trait.id);
    if (!v || v.effectiveDepth === "not_applicable") {
      return { trait, verdict: v, inScope, points: null };
    }
    const points = DEPTH_POINTS[v.effectiveDepth as Exclude<Depth, "not_applicable">];
    if (inScope) {
      num += points * trait.weight;
      den += 3 * trait.weight;
    }
    return { trait, verdict: v, inScope, points: inScope ? points : null };
  });

  const allEvidence = gated.flatMap((t) => t.gatedEvidence);
  return {
    pack,
    band,
    dealValueUsd,
    score: den === 0 ? 0 : Math.round((num / den) * 100),
    callType: verdict.callType,
    overallNote: verdict.overallNote,
    contextFlags: verdict.contextFlags,
    traits,
    evidenceStats: {
      total: allEvidence.length,
      corroborated: allEvidence.filter((e) => e.status !== "uncorroborated").length,
      unverifiedTraits: gated.filter((t) => t.unverified).length,
    },
  };
}

/** Transcript + verdict -> gated, scored, ready to render. */
export function applyMethodologyVerdict(
  pack: MethodologyPack,
  transcript: TranscriptLine[],
  rawVerdict: unknown,
  opts: { dealValueUsd?: number | null } = {},
): MethodologyScorecard {
  const verdict = MethodologyVerdictSchema.parse(rawVerdict);
  const known = new Set(pack.traits.map((t) => t.id));
  const filtered = { ...verdict, traits: verdict.traits.filter((t) => known.has(t.id)) };
  const gated = gateTraitVerdicts(filtered, transcript);
  return scoreMethodology(pack, gated, filtered, opts);
}

// ── Report (deterministic markdown) ─────────────────────────────────────────

const DEPTH_BADGE: Record<Depth, string> = {
  mastery: "🟢 mastery",
  developing: "🟡 developing",
  surface: "🟠 surface",
  missing: "🔴 missing",
  not_applicable: "⚪ n/a",
};

export function renderMethodologyReport(card: MethodologyScorecard): string {
  const lines: string[] = [];
  lines.push(`# ${card.pack.name} scorecard`);
  lines.push("");
  const bandNote = card.band
    ? `deal band: ${card.band.label} — scored against ${card.band.rigor}-rigor expectations`
    : "no deal value given — scored against the full methodology";
  lines.push(
    `**Score: ${card.score}/100** · call type: ${card.callType} · ${bandNote} · evidence corroborated: ${card.evidenceStats.corroborated}/${card.evidenceStats.total}`,
  );
  if (card.contextFlags.length > 0) {
    lines.push("");
    lines.push(`Context flags: ${card.contextFlags.join(", ")}`);
  }
  if (card.overallNote) {
    lines.push("");
    lines.push(card.overallNote);
  }
  lines.push("");
  lines.push("| Trait | Depth | Weight | Evidence |");
  lines.push("|---|---|---|---|");
  for (const row of card.traits.filter((r) => r.inScope)) {
    lines.push(traitRow(row));
  }

  const outOfScope = card.traits.filter((r) => !r.inScope);
  if (outOfScope.length > 0) {
    lines.push("");
    lines.push(
      `## Not scored at this deal size (shown for information, not judgment)`,
    );
    lines.push(
      `At ${card.band?.label ?? "this band"}, a rep is not expected to invest in these — a low mark here would mislead.`,
    );
    lines.push("");
    lines.push("| Trait | Depth observed | Rigor |");
    lines.push("|---|---|---|");
    for (const row of outOfScope) {
      const depth = row.verdict ? DEPTH_BADGE[row.verdict.effectiveDepth] : "—";
      lines.push(`| ${row.trait.name} | ${depth} | ${row.trait.rigor} |`);
    }
  }

  const gaps = card.traits.filter(
    (r) =>
      r.inScope &&
      r.verdict &&
      (r.verdict.effectiveDepth === "missing" ||
        r.verdict.effectiveDepth === "surface" ||
        r.verdict.unverified),
  );
  lines.push("");
  if (gaps.length > 0) {
    lines.push("## Coaching — close these before the next call");
    for (const row of gaps.sort((a, b) => b.trait.weight - a.trait.weight)) {
      const v = row.verdict!;
      lines.push("");
      lines.push(
        `### ${row.trait.name} — ${v.effectiveDepth}${v.unverified ? " (unverified)" : ""}`,
      );
      if (v.gap) lines.push(`**On this call:** ${v.gap}`);
      lines.push(`**Why it matters:** ${row.trait.coaching.why_it_matters}`);
      lines.push(`**Next move:** ${row.trait.coaching.next_move}`);
      lines.push(`**Try saying:** "${row.trait.coaching.example_line}"`);
    }
  } else {
    lines.push("## Coaching");
    lines.push(
      "Every scored trait reached developing or better with corroborated evidence. Share this call as an example.",
    );
  }
  return lines.join("\n");
}

function traitRow(row: ScoredTrait): string {
  const v = row.verdict;
  if (!v) return `| ${row.trait.name} | — not assessed | ${row.trait.weight} | — |`;
  const flags = [
    v.unverified ? "UNVERIFIED — evidence failed the gate" : null,
    !v.unverified && v.confidence < 0.6 && v.effectiveDepth !== "not_applicable"
      ? "low confidence — check this"
      : null,
  ]
    .filter(Boolean)
    .join("; ");
  const ev =
    v.gatedEvidence
      .filter((e) => e.status !== "uncorroborated")
      .map((e) => `"${truncate(e.quote, 60)}" [${e.lineId}]`)
      .join("<br>") || "—";
  return `| ${row.trait.name} | ${DEPTH_BADGE[v.effectiveDepth]}${flags ? ` (${flags})` : ""} | ${row.trait.weight} | ${ev} |`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

// ── Pack registry ───────────────────────────────────────────────────────────

export function getMethodologyPack(id: string): MethodologyPack | null {
  return METHODOLOGY_PACKS.find((p) => p.id === id) ?? null;
}

export function listMethodologyPacks(): Array<{ id: string; name: string; traits: number }> {
  return METHODOLOGY_PACKS.map((p) => ({ id: p.id, name: p.name, traits: p.traits.length }));
}

/** Validate a custom pack (e.g. compiled from an admin's free-text method). */
export function parseMethodologyPack(raw: unknown): MethodologyPack {
  return MethodologyPackSchema.parse(raw);
}

// ── LLM scoring (mirrors llm-extract.ts; optional — everything above works
//    on any verdict JSON, so demos and tests spend zero keys) ────────────────

export function buildMethodologyPrompt(
  pack: MethodologyPack,
  transcript: TranscriptLine[],
  opts: { dealValueUsd?: number | null } = {},
): { system: string; user: string } {
  const band = resolveDealBand(opts.dealValueUsd ?? null);
  const scope = traitsInScope(pack, band);
  const traitBlock = pack.traits
    .map((t) =>
      [
        `### ${t.id} — ${t.name} (weight ${t.weight}, rigor ${t.rigor}${scope.has(t.id) ? "" : ", OUT OF SCOPE at this deal size — assess for information only"})`,
        t.definition,
        ...t.classifying_questions.map((q) => `- ${q}`),
        t.met_signals.length ? `Mastery looks like: ${t.met_signals.join("; ")}` : null,
        t.miss_signals.length ? `Missing looks like: ${t.miss_signals.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const system = `You score one sales call against the ${pack.name} methodology.
Return ONLY valid JSON:
{
  "callType": string,
  "overallNote": string,
  "contextFlags": string[],
  "traits": [{"id": string, "depth": "missing"|"surface"|"developing"|"mastery"|"not_applicable",
              "confidence": number, "evidence": [{"lineId": "L1", "quote": string}], "gap": string}]
}
Depth rubric (score depth, not activity):
- missing: rep did not attempt this area
- surface: mentioned but no depth or follow-up
- developing: good attempt, partial discovery achieved
- mastery: deep, multi-layered discovery WITH business impact uncovered — never award mastery without impact linkage
Rules:
- One entry per trait below, using its exact id.
- evidence.quote MUST be a short contiguous snippet copied VERBATIM from the cited line. Never paraphrase, never fix grammar or numbers.
- depth developing or mastery REQUIRES evidence; missing needs none — put specifics in gap.
- gap must reference this call's actual content, not generic advice.
- Flag scoring-fairness context in contextFlags (e.g. "premature_solutioning" if the rep pitched before discovering, "short_call", "single_threaded").
${band ? `- Deal band: ${band.label}. Out-of-scope traits are excluded from the score automatically — assess them honestly anyway.` : ""}

## ${pack.name}
${pack.summary}

## Traits
${traitBlock}`;

  const user = `Transcript:\n${transcript.map((l) => `[${l.id}] ${l.speaker}: ${l.text}`).join("\n")}`;
  return { system, user };
}

export async function scoreCallWithLlm(
  pack: MethodologyPack,
  transcript: TranscriptLine[],
  opts: { dealValueUsd?: number | null } = {},
): Promise<MethodologyScorecard> {
  if (!hasLlmFallback()) {
    throw new Error("LLM is not configured — use applyMethodologyVerdict with a stored verdict, or the demo verdict");
  }
  const { system, user } = buildMethodologyPrompt(pack, transcript, opts);
  const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llmModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Methodology scoring failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty methodology scoring response");
  return applyMethodologyVerdict(pack, transcript, JSON.parse(content), opts);
}

// ── Keyless demo (spends nothing; used by tests and the demo path) ──────────
// A stored verdict for sample-calls/brightsmile-01-discovery.json scored as
// MEDDIC at a mid-market deal value (5 locations, ~$30k/yr): deep-rigor
// champion work is out of scope at that size, so its absence informs without
// dragging the score — the deal-value caveat, demonstrated.

export const DEMO_METHODOLOGY_VERDICTS: Record<
  string,
  { packId: string; dealValueUsd: number; verdict: MethodologyVerdict }
> = {
  "brightsmile-01-discovery": {
    packId: "meddic",
    dealValueUsd: 30_000,
    verdict: {
      callType: "discovery",
      overallNote:
        "Strong pain discovery with the buyer quantifying the after-hours bleed himself. Budget surfaced early and reframed as a trust problem. The renewal window is known but no path from Thursday's demo to a decision was mapped, and the office-manager thread was left undeveloped.",
      contextFlags: ["single_threaded"],
      traits: [
        {
          id: "identify_pain",
          depth: "mastery",
          confidence: 0.95,
          evidence: [
            { lineId: "L6", quote: "after hours is the real bleed" },
            { lineId: "L4", quote: "drop mid transfer between locations at least a few times a day" },
          ],
          gap: "",
        },
        {
          id: "metrics",
          depth: "developing",
          confidence: 0.8,
          evidence: [
            { lineId: "L6", quote: "we lose maybe ten bookings a week that way" },
          ],
          gap: "The buyer volunteered ten lost bookings a week but the rep never converted it to dollars or confirmed the math back — the number is still the buyer's aside, not an agreed metric.",
        },
        {
          id: "economic_buyer",
          depth: "developing",
          confidence: 0.7,
          evidence: [
            { lineId: "L11", quote: "we do not have a budget problem honestly it's a trust problem" },
          ],
          gap: "Rahul talks like the budget owner, but for a five-location switch nobody asked whether anyone else signs off — ownership was assumed, not confirmed.",
        },
        {
          id: "decision_criteria",
          depth: "developing",
          confidence: 0.75,
          evidence: [
            { lineId: "L11", quote: "i'm not doing that dance again without proof it works" },
            { lineId: "L17", quote: "keep it practical i don't need a slideshow" },
          ],
          gap: "Two criteria surfaced (proof it works, practical over polished) but they were never played back or ranked against what RingHawk fails on.",
        },
        {
          id: "decision_process",
          depth: "surface",
          confidence: 0.55,
          evidence: [
            { lineId: "L13", quote: "we can sign by end of month" },
          ],
          gap: "The renewal is 'coming up' and a Thursday demo is booked, but no steps between demo and decision were mapped — no date, no approver, no path.",
        },
        {
          id: "champion",
          depth: "missing",
          confidence: 0.85,
          evidence: [],
          gap: "The office manager who keeps asking about text reminders (L15) is a natural internal advocate and was never brought into the Thursday demo or equipped with anything.",
        },
      ],
    },
  },
};

export function demoMethodologyScorecard(
  slug: string,
  transcript: TranscriptLine[],
): MethodologyScorecard | null {
  const demo = DEMO_METHODOLOGY_VERDICTS[slug];
  if (!demo) return null;
  const pack = getMethodologyPack(demo.packId);
  if (!pack) return null;
  return applyMethodologyVerdict(pack, transcript, demo.verdict, {
    dealValueUsd: demo.dealValueUsd,
  });
}

// ── Embedded packs (14) ─────────────────────────────────────────────────────
// Generated from the methodology-coach pack library; component lists follow
// the methodology owners' materials. rigor drives deal-band scoring above.

export const METHODOLOGY_PACKS: MethodologyPack[] = MethodologyPackSchema.array().parse(
  [
  {
    "id": "bant",
    "name": "BANT",
    "origin": "IBM, 1950s-60s internal qualification guide.",
    "summary": "Fast qualification: Budget, Authority, Need, Timing. Best for high-velocity SDR/first-call qualification; too shallow for enterprise deal inspection on its own.",
    "motion": "Transactional / SMB, high-velocity inbound, SDR first calls.",
    "traits": [
      {
        "id": "budget",
        "name": "Budget",
        "weight": 3,
        "rigor": "core",
        "definition": "Whether funds exist or can be allocated for this problem, and how they get approved.",
        "classifying_questions": [
          "Did the rep ask whether funds exist or can be allocated for this problem?",
          "Did they test the budget range against the likely price?",
          "Did they learn how budget is approved and by whom?"
        ],
        "met_signals": [
          "a range or approval path is stated",
          "prospect confirms this is funded or fundable"
        ],
        "miss_signals": [
          "price never approached",
          "rep assumes budget from company size"
        ],
        "coaching": {
          "why_it_matters": "A qualified need without money is a nice conversation, not a pipeline entry.",
          "next_move": "Test a realistic range early and ask how spends of that size get approved.",
          "example_line": "Solutions like this typically land between X and Y — is that a range you could get approved if the fit is right?"
        }
      },
      {
        "id": "authority",
        "name": "Authority",
        "weight": 3,
        "rigor": "standard",
        "definition": "Whether the contact can make or heavily influence the decision, and who else must sign off.",
        "classifying_questions": [
          "Did the rep establish whether the contact can make or heavily influence the decision?",
          "Did they identify who else must sign off?",
          "If the decision-maker wasn't on the call, was a path to them secured?"
        ],
        "met_signals": [
          "decision role clarified",
          "next step includes the decision-maker"
        ],
        "miss_signals": [
          "seniority assumed from title",
          "'I'll share it with the team' accepted flat"
        ],
        "coaching": {
          "why_it_matters": "Selling hard to someone who can't buy is the most expensive way to practice your pitch.",
          "next_move": "Ask how the decision was made last time they bought something similar, and get the decision-maker into the next step.",
          "example_line": "Besides you, who would need to be comfortable with this before it could go ahead?"
        }
      },
      {
        "id": "need",
        "name": "Need",
        "weight": 4,
        "rigor": "core",
        "definition": "A genuine business need the product addresses, ranked for severity, in the buyer's own words.",
        "classifying_questions": [
          "Did the rep confirm a genuine business need the product addresses?",
          "Did they rank the need's severity or priority against everything else on the buyer's plate?",
          "Did the buyer articulate the need in their own words?"
        ],
        "met_signals": [
          "prospect describes the problem unprompted",
          "priority relative to other initiatives established"
        ],
        "miss_signals": [
          "need inferred solely from the demo request",
          "rep lists problems the prospect merely agrees to"
        ],
        "coaching": {
          "why_it_matters": "Without an admitted, prioritized need the deal evaporates at the first budget review.",
          "next_move": "Have the prospect rank this problem against their other priorities before proposing next steps.",
          "example_line": "Of everything on your plate this quarter, where does fixing this actually rank?"
        }
      },
      {
        "id": "timing",
        "name": "Timing",
        "weight": 3,
        "rigor": "core",
        "definition": "When the buyer intends to decide or implement, anchored to a driving event.",
        "classifying_questions": [
          "Did the rep establish when the buyer intends to decide or implement?",
          "Is there a driving event behind the date (contract expiry, launch, headcount change)?",
          "Did they test what happens if the date slips?"
        ],
        "met_signals": [
          "a date tied to a real event",
          "consequence of slipping acknowledged"
        ],
        "miss_signals": [
          "'sometime next quarter' accepted",
          "rep-imposed urgency with no buyer event"
        ],
        "coaching": {
          "why_it_matters": "Deals without a real deadline drift forever; a buyer event is the only deadline that survives contact with reality.",
          "next_move": "Find the event behind the timeline — and if there isn't one, requalify how real this is.",
          "example_line": "What happens on your side if this isn't live by that date?"
        }
      }
    ]
  },
  {
    "id": "challenger",
    "name": "Challenger Sale",
    "origin": "Matthew Dixon & Brent Adamson (CEB research, 2011); Challenger, Inc.",
    "summary": "Teach, Tailor, Take Control: lead with a commercial insight that reframes the buyer's problem, tailor it to the stakeholder, and keep constructive tension — especially around money and next steps. Includes the 6-step commercial-teaching arc (Warmer, Reframe, Rational Drowning, Emotional Impact, A New Way, Your Solution) as a fourth scoreable trait for presentation calls.",
    "motion": "Insight-led enterprise/mid-market selling against status-quo buyers; reframe and presentation calls.",
    "traits": [
      {
        "id": "teach",
        "name": "Teach for differentiation",
        "weight": 5,
        "rigor": "standard",
        "definition": "Delivering a genuine insight the buyer didn't know about their own business — one that reframes the problem and leads to your unique differentiation, not generic thought leadership.",
        "classifying_questions": [
          "Did the rep deliver a genuine insight the buyer didn't already know about their own business or market?",
          "Did the insight reframe how the buyer sees a problem or opportunity?",
          "Did the teaching lead naturally to the rep's unique differentiation rather than generic thought leadership?"
        ],
        "met_signals": [
          "'we've noticed teams like yours actually lose money on X' framing",
          "buyer reacts with surprise or reflection ('huh, we hadn't thought of it that way')"
        ],
        "miss_signals": [
          "insight is a rebranded feature pitch",
          "generic industry stats with no reframe"
        ],
        "coaching": {
          "why_it_matters": "Buyers reward reps who teach them something about their own business — it's the top-ranked rep behavior in the original CEB research.",
          "next_move": "Build one data-backed insight about this prospect's segment that only your vantage point reveals, and open with it.",
          "example_line": "Across the teams we work with, the surprising cost isn't missed calls — it's the 40% of follow-ups that never happen. Can I show you what that looks like in your numbers?"
        }
      },
      {
        "id": "tailor",
        "name": "Tailor for resonance",
        "weight": 3,
        "rigor": "standard",
        "definition": "Adapting the message to this stakeholder's role, KPIs, industry, and personal value drivers — and re-adapting when new context emerges mid-call.",
        "classifying_questions": [
          "Did the rep adapt the message to this stakeholder's role, KPIs, and industry context?",
          "Did they reference the buyer's specific value drivers rather than a generic pitch?",
          "Did they adjust when new stakeholder context emerged mid-call?"
        ],
        "met_signals": [
          "message framed in the listener's metric (ops hours for ops, pipeline for VP sales)",
          "mid-call pivot when a new stakeholder joined"
        ],
        "miss_signals": [
          "same pitch regardless of who's in the room",
          "value framed in the rep's vocabulary, not the buyer's"
        ],
        "coaching": {
          "why_it_matters": "The same insight lands or dies based on whose KPI it's framed in — resonance is the price of the reframe being heard.",
          "next_move": "Before the next call, write one sentence per attendee: their KPI, and your message restated in it.",
          "example_line": "For you specifically, this shows up as forecast accuracy — let me put it in those terms."
        }
      },
      {
        "id": "take_control",
        "name": "Take control",
        "weight": 4,
        "rigor": "core",
        "definition": "Comfort with constructive tension: discussing money directly, pushing back on buyer assumptions, resisting discount pressure, and driving concrete next steps instead of vague follow-ups.",
        "classifying_questions": [
          "Did the rep discuss money and pricing directly, without flinching?",
          "Did they push back constructively on buyer assumptions or process — maintaining tension without aggression?",
          "Did they drive concrete, dated next steps rather than accepting vague follow-ups?",
          "Did they hold the line on discount pressure?"
        ],
        "met_signals": [
          "pricing addressed head-on",
          "rep respectfully challenges 'we always do an RFP'",
          "call ends with a dated commitment"
        ],
        "miss_signals": [
          "'send us your best price' pacified with a discount",
          "call ends with 'circle back next month'"
        ],
        "coaching": {
          "why_it_matters": "Challengers win by holding tension where average reps release it — every released tension costs margin or momentum.",
          "next_move": "Pick the one buyer assumption you disagreed with silently on this call, and challenge it openly on the next.",
          "example_line": "I'll push back on that: running this as a three-month RFP is exactly how the problem survives another two quarters. Can I suggest a faster path?"
        }
      },
      {
        "id": "teaching_choreography",
        "name": "Commercial teaching arc",
        "weight": 2,
        "rigor": "deep",
        "definition": "For presentation-style calls: the 6-step arc — Warmer, Reframe, Rational Drowning, Emotional Impact, A New Way, Your Solution — with the solution arriving LAST.",
        "classifying_questions": [
          "Did the call follow reframe-before-solution — the product appearing only after the problem was rebuilt?",
          "Was there rational drowning (data making the status quo untenable) and emotional impact (a story making it felt)?",
          "Mark not_applicable for pure discovery calls with no presentation segment."
        ],
        "met_signals": [
          "solution introduced in the last third",
          "a customer story that makes the cost of inaction visceral"
        ],
        "miss_signals": [
          "deck opens with the product",
          "no emotional beat anywhere in the narrative"
        ],
        "coaching": {
          "why_it_matters": "The order is the method: a solution shown before the reframe is just another demo to compare on price.",
          "next_move": "Restructure the deck so the product doesn't appear until the buyer has felt the cost of their current path.",
          "example_line": "Before I show you anything of ours, let me show you what the current path costs teams like yours."
        }
      }
    ]
  },
  {
    "id": "champ",
    "name": "CHAMP",
    "origin": "Zorian Rotenberg (InsightSquared, ~2014) — a buyer-centric reordering of BANT.",
    "summary": "Challenges, Authority, Money, Prioritization: lead with the buyer's challenges before any budget or authority talk, then map decision-makers, funding, and where this ranks among the buyer's initiatives.",
    "motion": "SMB / mid-market, high-velocity inbound; a buyer-friendly BANT replacement.",
    "traits": [
      {
        "id": "challenges",
        "name": "Challenges",
        "weight": 5,
        "rigor": "core",
        "definition": "The buyer's pain points, led with — before budget or authority — and ranked by the buyer.",
        "classifying_questions": [
          "Did the rep lead with the buyer's pain points before any budget or authority talk?",
          "Did the buyer confirm which challenge matters most?"
        ],
        "met_signals": [
          "call opens on the buyer's problems",
          "top challenge named by the buyer"
        ],
        "miss_signals": [
          "qualification checklist run before any pain discussion"
        ],
        "coaching": {
          "why_it_matters": "CHAMP exists because buyers hang up on budget interrogations — challenges first is what earns the rest of the acronym.",
          "next_move": "Restructure the opener around their problems; hold money questions until a challenge is confirmed.",
          "example_line": "Before anything about us — what's the problem that made you take this call?"
        }
      },
      {
        "id": "authority",
        "name": "Authority",
        "weight": 3,
        "rigor": "standard",
        "definition": "Decision-makers and influencers mapped, with a planned route to the decision-maker.",
        "classifying_questions": [
          "Did the rep map decision-makers and influencers?",
          "Did they plan a route to the decision-maker?"
        ],
        "met_signals": [
          "buying roles identified",
          "a concrete step toward the decision-maker"
        ],
        "miss_signals": [
          "authority assumed from the contact's title"
        ],
        "coaching": {
          "why_it_matters": "Influencers inform, decision-makers decide — you need a mapped route to the latter.",
          "next_move": "Ask who else touches this decision and propose a step that includes them.",
          "example_line": "Who besides you gets a vote here, and what would they want to see?"
        }
      },
      {
        "id": "money",
        "name": "Money",
        "weight": 3,
        "rigor": "standard",
        "definition": "Budget or resources allocated (or allocatable) to the challenge — explored AFTER establishing it — testing willingness to fund vs mere interest.",
        "classifying_questions": [
          "Did the rep explore budget or resources for the challenge after establishing it?",
          "Did they test willingness to fund versus mere interest?"
        ],
        "met_signals": [
          "funding path discussed in the context of the confirmed challenge"
        ],
        "miss_signals": [
          "budget question fired before any pain",
          "interest mistaken for intent"
        ],
        "coaching": {
          "why_it_matters": "Interest is free; funding is a decision. Testing the difference early saves quarters.",
          "next_move": "Once the challenge is confirmed, ask what solving it would be worth funding.",
          "example_line": "If this is as costly as it sounds, is it something you'd fund this quarter, or is it a next-year problem?"
        }
      },
      {
        "id": "prioritization",
        "name": "Prioritization",
        "weight": 4,
        "rigor": "core",
        "definition": "Where solving this ranks among the buyer's initiatives, and why it must be solved now.",
        "classifying_questions": [
          "Did the rep establish where solving this ranks among the buyer's initiatives?",
          "Is there a reason it must be solved now?"
        ],
        "met_signals": [
          "explicit ranking against other initiatives",
          "a now-reason articulated"
        ],
        "miss_signals": [
          "priority never tested",
          "deal advanced on politeness"
        ],
        "coaching": {
          "why_it_matters": "Deals lose to other priorities more often than to competitors — rank tells you which pipeline this really is.",
          "next_move": "Ask the ranking question directly and believe the answer.",
          "example_line": "Honestly — of your top five initiatives this quarter, is this one of them?"
        }
      }
    ]
  },
  {
    "id": "command-of-message",
    "name": "Command of the Message",
    "origin": "Force Management (Frank Azzolino & John Kaplan). Usually deployed alongside a MEDDPICC qualification layer.",
    "summary": "Value-based messaging via the Value Framework: Current State & Negative Consequences -> Positive Business Outcomes -> Required Capabilities ('the ability to...') -> Metrics -> Proof Points -> Differentiation. Framed by the Three Whys: Why change? Why now? Why you?",
    "motion": "Enterprise value-based selling; the messaging layer at Force Management-trained orgs.",
    "traits": [
      {
        "id": "negative_consequences",
        "name": "Current State & Negative Consequences",
        "weight": 4,
        "rigor": "core",
        "definition": "The buyer's current state established, with the cost of inaction made explicit — and acknowledged by the buyer.",
        "classifying_questions": [
          "Did the rep establish the buyer's current state and make the cost of staying there explicit?",
          "Did the buyer acknowledge those negative consequences?"
        ],
        "met_signals": [
          "cost of inaction stated and confirmed",
          "'why change?' effectively answered"
        ],
        "miss_signals": [
          "current state skipped en route to the pitch",
          "consequences asserted but never agreed"
        ],
        "coaching": {
          "why_it_matters": "'Why change?' is the first why — un-answered, the status quo wins by default.",
          "next_move": "Get the buyer to say out loud what staying put costs them before you present anything.",
          "example_line": "If nothing changes this year, what does that cost the team — and is that acceptable to leadership?"
        }
      },
      {
        "id": "pbo",
        "name": "Positive Business Outcomes",
        "weight": 4,
        "rigor": "standard",
        "definition": "The conversation elevated from features to measurable business results the buyer agrees to target.",
        "classifying_questions": [
          "Did the rep elevate the conversation from features to business outcomes stated as measurable results?",
          "Did the buyer agree on the target outcomes?"
        ],
        "met_signals": [
          "outcomes phrased as measurable results",
          "buyer signs up to the target"
        ],
        "miss_signals": [
          "conversation stays at feature level",
          "outcomes generic ('efficiency')"
        ],
        "coaching": {
          "why_it_matters": "Executives fund outcomes, not features — PBOs are what the deal is actually about.",
          "next_move": "Reframe your top three talking points as measurable business results and validate them with the buyer.",
          "example_line": "Forget the product for a second — is 'cut ramp time for new reps from 8 weeks to 4' the outcome that matters here?"
        }
      },
      {
        "id": "required_capabilities",
        "name": "Required Capabilities",
        "weight": 4,
        "rigor": "standard",
        "definition": "Needs framed as capabilities ('the ability to...') rather than product features — seeded to map to your differentiation.",
        "classifying_questions": [
          "Did the rep frame needs as capabilities ('the ability to...') rather than product features?",
          "Did they seed capabilities that map to their differentiation?"
        ],
        "met_signals": [
          "'so you need the ability to X' formulations agreed",
          "capabilities that only you fully satisfy"
        ],
        "miss_signals": [
          "straight feature-matching against a checklist",
          "capabilities dictated entirely by a competitor's RFP"
        ],
        "coaching": {
          "why_it_matters": "Whoever writes the required capabilities writes the scorecard the winner is picked on.",
          "next_move": "Translate this call's pains into 'ability to' statements and get the buyer to adopt them as requirements.",
          "example_line": "It sounds like the requirement is the ability to have every call logged and followed up without a rep touching the CRM — fair?"
        }
      },
      {
        "id": "metrics",
        "name": "Metrics",
        "weight": 3,
        "rigor": "standard",
        "definition": "Numbers attached to outcomes and capabilities, baselined against the current state.",
        "classifying_questions": [
          "Did the rep attach numbers to outcomes and capabilities?",
          "Were metrics baselined against the current state?"
        ],
        "met_signals": [
          "before/after numbers agreed"
        ],
        "miss_signals": [
          "outcomes stay qualitative"
        ],
        "coaching": {
          "why_it_matters": "A PBO without a metric is a wish — metrics make the business case auditable and the success plan real.",
          "next_move": "Baseline today's number for each agreed outcome before proposing targets.",
          "example_line": "What's the current number for ramp time, so we can measure the change against it?"
        }
      },
      {
        "id": "proof_points",
        "name": "Proof Points",
        "weight": 2,
        "rigor": "deep",
        "definition": "Specific, relevant customer evidence — mapped to this buyer's desired outcomes, not generic logos.",
        "classifying_questions": [
          "Did the rep cite specific, relevant customer results rather than generic logos?",
          "Did the proof map to this buyer's desired outcomes?"
        ],
        "met_signals": [
          "a named peer story with numbers matching this buyer's PBOs"
        ],
        "miss_signals": [
          "logo slide with no outcomes",
          "case study from an irrelevant segment"
        ],
        "coaching": {
          "why_it_matters": "Proof de-risks the decision for the people you never meet — but only when it mirrors this buyer's target outcomes.",
          "next_move": "Pick one customer whose before/after matches this buyer's PBOs and tell that story with numbers.",
          "example_line": "A 45-rep team just like yours cut missed follow-ups 80% in one quarter — here's exactly how their numbers moved."
        }
      },
      {
        "id": "differentiation",
        "name": "Differentiation (Why you? Why now?)",
        "weight": 3,
        "rigor": "standard",
        "definition": "How you solve the problem differently and better, mapped to the buyer's outcomes — answering 'Why you?' and 'Why now?' convincingly.",
        "classifying_questions": [
          "Did the rep articulate how they solve the problem differently or better?",
          "Did they answer 'Why you?' and 'Why now?' convincingly, tied to the buyer's outcomes?"
        ],
        "met_signals": [
          "differentiators tied to required capabilities",
          "urgency grounded in the buyer's timeline"
        ],
        "miss_signals": [
          "'we're the leader' assertions",
          "differentiation the buyer can't repeat"
        ],
        "coaching": {
          "why_it_matters": "Your champion has to answer 'why them?' in a room you're not in — arm them with a differentiation they can repeat.",
          "next_move": "Compress your differentiation into one sentence tied to this buyer's #1 outcome and test whether the buyer can say it back.",
          "example_line": "We're the only option where the follow-up is drafted and the CRM updated before the rep hangs up — that's what gets you the pipeline number."
        }
      }
    ]
  },
  {
    "id": "gap",
    "name": "GAP Selling",
    "origin": "Keenan (Jim Keenan), A Sales Growth Company — 'Gap Selling' (2018).",
    "summary": "Diagnostic selling: rigorously establish the Current State (facts, problems, impact, root cause, emotion), the Future State (the buyer's own measurable vision), and the Gap between them — the gap IS the value of the sale. Solution talk maps strictly to the diagnosed gap.",
    "motion": "Discovery-heavy, problem-centric selling; the strongest rubric for first/second discovery calls.",
    "traits": [
      {
        "id": "current_state",
        "name": "Current State",
        "weight": 4,
        "rigor": "core",
        "definition": "The literal, factual environment today: how things work, the specific problems, their business impact, and the emotional dimension for the buyer.",
        "classifying_questions": [
          "Did the rep uncover the literal, factual environment — how things work today?",
          "Did they identify specific problems AND their business impact?",
          "Did they capture the emotional dimension (frustration, risk to the buyer personally)?"
        ],
        "met_signals": [
          "process mapped in concrete detail",
          "problems tied to named impacts"
        ],
        "miss_signals": [
          "current state assumed from the demo request",
          "impact never asked, only problems listed"
        ],
        "coaching": {
          "why_it_matters": "You can't sell a change you haven't diagnosed — the current state is the baseline every dollar of value is measured against.",
          "next_move": "Re-open discovery: pick the vaguest problem from this call and get the literal facts and its measured impact.",
          "example_line": "Walk me through exactly what happens today from the moment a call ends to the moment the CRM is updated."
        }
      },
      {
        "id": "root_cause",
        "name": "Root Cause & Impact diagnosis",
        "weight": 4,
        "rigor": "standard",
        "definition": "Digging past surface symptoms to root causes your product actually addresses, and tracing how one problem cascades into others (problem -> impact -> root cause).",
        "classifying_questions": [
          "Did the rep dig to root cause rather than accepting surface symptoms?",
          "Did they connect problems to root causes their product actually addresses?",
          "Did they explore how one problem cascades into others?"
        ],
        "met_signals": [
          "'why does that happen?' chains",
          "a symptom traced to a process or tooling cause"
        ],
        "miss_signals": [
          "first symptom accepted and pitched at",
          "root cause asserted by the rep without evidence"
        ],
        "coaching": {
          "why_it_matters": "Selling to symptoms invites the cheapest painkiller; selling to root cause invites the cure — and justifies its price.",
          "next_move": "For the top problem, ask 'why' until you hit a cause your product removes, and confirm that chain with the buyer.",
          "example_line": "You said follow-ups slip — why do they slip? What is it about the current setup that makes that the default?"
        }
      },
      {
        "id": "future_state",
        "name": "Future State",
        "weight": 3,
        "rigor": "standard",
        "definition": "The buyer's OWN desired end state in concrete, measurable terms — including what achieving it means for them personally.",
        "classifying_questions": [
          "Did the rep get the buyer to articulate the desired end state in concrete, measurable terms?",
          "Is the future state the buyer's own vision, not the rep's projection?",
          "Did they explore what achieving it means for the buyer personally?"
        ],
        "met_signals": [
          "buyer describes the target numbers or workflow themselves",
          "personal stake surfaced"
        ],
        "miss_signals": [
          "rep paints the after-picture and the buyer nods",
          "future state is 'use our product'"
        ],
        "coaching": {
          "why_it_matters": "The buyer moves toward their own picture, not yours — a future state they authored is one they'll fund.",
          "next_move": "Ask the buyer to describe six months after the problem is gone: what's different, and by how much?",
          "example_line": "Paint me the picture: it's two quarters from now and this is solved — what does the team's week look like, and what number moved?"
        }
      },
      {
        "id": "the_gap",
        "name": "The Gap",
        "weight": 5,
        "rigor": "standard",
        "definition": "The explicitly quantified distance between current and future state — made big enough to justify change, and agreed by the buyer to be worth closing.",
        "classifying_questions": [
          "Did the rep explicitly quantify the distance between current and future state (revenue, cost, time)?",
          "Was the gap made large enough to justify the cost and pain of change?",
          "Did the buyer agree the gap is worth closing?"
        ],
        "met_signals": [
          "a stated delta ('from 12 hours to 2, that's 500 hours a quarter')",
          "buyer confirms the math"
        ],
        "miss_signals": [
          "current and future discussed but never subtracted",
          "gap stated only by the rep"
        ],
        "coaching": {
          "why_it_matters": "The gap is the value of the sale — no quantified gap, no defensible price, no urgency.",
          "next_move": "Do the subtraction out loud with the buyer on the next call and get their agreement that the delta is real.",
          "example_line": "So today it's 12 hours a week, and the target is 2 — that's 500 hours a quarter. Is that a gap worth spending money to close?"
        }
      },
      {
        "id": "gap_alignment",
        "name": "Solution mapped to the gap",
        "weight": 2,
        "rigor": "core",
        "definition": "Demo and solution talk tied strictly to the diagnosed gap — no features unrelated to the identified problems.",
        "classifying_questions": [
          "Did the rep tie demo/solution talk strictly to the diagnosed gap?",
          "Did they avoid pitching features unrelated to the identified problems?",
          "Mark not_applicable if the call was pure discovery with no solution segment."
        ],
        "met_signals": [
          "each capability introduced with the problem it closes",
          "features skipped explicitly ('you don't need X for this')"
        ],
        "miss_signals": [
          "generic product tour",
          "features hunting for a problem"
        ],
        "coaching": {
          "why_it_matters": "Every off-gap feature dilutes the diagnosis and reopens price comparison — you sell the bridge, not the catalog.",
          "next_move": "Cut the next demo to only what closes this buyer's diagnosed gap; name the problem before each capability.",
          "example_line": "You don't need most of what we do — here are the two things that close the gap we measured, and nothing else."
        }
      }
    ]
  },
  {
    "id": "meddic",
    "name": "MEDDIC",
    "origin": "Dick Dunkel & Jack Napoli, PTC (1996)",
    "summary": "Qualification framework for complex B2B sales: deals are won by rigorously qualifying Metrics, Economic buyer, Decision criteria, Decision process, Identified pain, and Champion. Scored per call as observed / not-yet-observed.",
    "motion": "Enterprise and mid-market complex sales with multiple stakeholders.",
    "traits": [
      {
        "id": "metrics",
        "name": "Metrics",
        "weight": 4,
        "rigor": "core",
        "definition": "Quantified business impact of solving the problem — numbers the buyer confirmed, not the rep's brochure claims.",
        "classifying_questions": [
          "Did the rep get the prospect to quantify the problem or the value of solving it (revenue, cost, hours, error rate)?",
          "Are the numbers the prospect's own (stated or confirmed by them), rather than only asserted by the rep?",
          "Did the rep tie those numbers to what success would look like after purchase?"
        ],
        "met_signals": [
          "prospect states a number for the pain or the win",
          "rep asks 'how much does that cost you today?'",
          "a before/after target is agreed"
        ],
        "miss_signals": [
          "value discussed only in adjectives ('faster', 'better')",
          "rep quotes ROI stats the prospect never engages with"
        ],
        "coaching": {
          "why_it_matters": "Unquantified pain loses to 'do nothing'. Metrics are what your champion repeats to the CFO when you're not in the room.",
          "next_move": "Pick the sharpest pain from this call and ask the prospect to put a number on it, then confirm the number back in writing.",
          "example_line": "You mentioned reps re-dial manually all day — roughly how many hours a week is that across the team, and what does that cost you?"
        }
      },
      {
        "id": "economic_buyer",
        "name": "Economic Buyer",
        "weight": 4,
        "rigor": "standard",
        "definition": "Identifying (and working toward access to) the person with final budget authority and veto power.",
        "classifying_questions": [
          "Did the rep ask who gives final sign-off or owns the budget for this purchase?",
          "Is the economic buyer named as a person or role (not just 'management')?",
          "Was a step agreed that moves toward the economic buyer (intro, exec briefing, joint call)?"
        ],
        "met_signals": [
          "a named budget owner",
          "an agreed path to meet them"
        ],
        "miss_signals": [
          "rep assumes the contact can sign",
          "'we'll run it by leadership' left unexplored"
        ],
        "coaching": {
          "why_it_matters": "Deals stall in the last mile when the person who can say yes has never heard your story.",
          "next_move": "Ask your contact directly who signs and what that person cares about; propose a specific joint step with them.",
          "example_line": "When a purchase like this gets approved, whose budget does it come out of — and what would they need to see to say yes quickly?"
        }
      },
      {
        "id": "decision_criteria",
        "name": "Decision Criteria",
        "weight": 3,
        "rigor": "standard",
        "definition": "The formal and informal yardsticks the buyer will use to compare options (technical, commercial, compliance).",
        "classifying_questions": [
          "Did the rep ask what the buyer will evaluate vendors on?",
          "Were specific criteria surfaced (integrations, security, price ceiling, support model)?",
          "Did the rep attempt to influence or add to the criteria in their favor?"
        ],
        "met_signals": [
          "a criteria list is stated or confirmed",
          "rep introduces a differentiating criterion the buyer accepts"
        ],
        "miss_signals": [
          "demo proceeds with no idea how it will be judged",
          "criteria assumed from a previous deal"
        ],
        "coaching": {
          "why_it_matters": "If you don't know the yardstick, a competitor is defining it — usually around their strengths.",
          "next_move": "Get the written or informal evaluation list before the next stage; propose one criterion where you win outright.",
          "example_line": "When you compare us against the others, what are the three things that will actually decide it?"
        }
      },
      {
        "id": "decision_process",
        "name": "Decision Process",
        "weight": 3,
        "rigor": "standard",
        "definition": "The steps, people, and timeline between 'we like it' and a signed contract — including validation and approval stages.",
        "classifying_questions": [
          "Did the rep map how a decision like this actually gets made (stages, approvers, timeline)?",
          "Is there an agreed target date or event anchoring the timeline?",
          "Did the rep test the process against the buyer's stated deadline ('to go live by X, we'd need to...')?"
        ],
        "met_signals": [
          "stages and dates are articulated",
          "a mutual plan or next milestone is agreed"
        ],
        "miss_signals": [
          "'send us a proposal' accepted with no process mapped",
          "no timeline anchor at all"
        ],
        "coaching": {
          "why_it_matters": "Deals without a mapped process slip quarter after quarter — every unmapped step is a surprise delay.",
          "next_move": "Build a reverse timeline from the buyer's target date and confirm each step and owner with your contact.",
          "example_line": "If you wanted this live before the new quarter, could we walk backwards from that date and list every step and who owns it?"
        }
      },
      {
        "id": "identify_pain",
        "name": "Identified Pain",
        "weight": 5,
        "rigor": "core",
        "definition": "A concrete, admitted business pain with consequences — the reason to change at all.",
        "classifying_questions": [
          "Did the prospect articulate a specific problem in their own words?",
          "Did the rep dig into the consequences of not solving it (who is affected, what breaks, what it blocks)?",
          "Is the pain connected to a business outcome rather than a mild inconvenience?"
        ],
        "met_signals": [
          "prospect describes the problem unprompted or under questioning",
          "consequences and urgency surfaced"
        ],
        "miss_signals": [
          "rep pitches features before any pain is established",
          "pain stated by the rep and merely not denied"
        ],
        "coaching": {
          "why_it_matters": "No admitted pain, no deal — everything else in MEDDIC hangs off a pain the buyer owns.",
          "next_move": "Re-open discovery on the strongest pain hint from this call before advancing the demo conversation.",
          "example_line": "You said missed follow-ups are hurting renewals — can you walk me through the last time that happened and what it cost?"
        }
      },
      {
        "id": "champion",
        "name": "Champion",
        "weight": 4,
        "rigor": "deep",
        "definition": "A person with power and personal stake who sells for you internally.",
        "classifying_questions": [
          "Is there someone on the buyer side who actively wants this to happen and says so?",
          "Did the rep test the champion's influence (access to power, willingness to advocate)?",
          "Did the rep equip them with something to sell internally (summary, business case, demo access)?"
        ],
        "met_signals": [
          "contact volunteers to advocate or arrange internal meetings",
          "rep asks 'who else needs convincing and can you get us in front of them?'"
        ],
        "miss_signals": [
          "friendly contact mistaken for champion with no influence test",
          "no internal selling materials offered"
        ],
        "coaching": {
          "why_it_matters": "You are absent from most of the buying process; a tested champion is your proxy in every meeting you're not in.",
          "next_move": "Give your likely champion one concrete asset (a one-pager with THEIR metrics) and ask them to socialize it, then watch whether they do.",
          "example_line": "If I put together a one-page summary with the numbers we discussed, would you be comfortable walking your VP through it before our next call?"
        }
      }
    ]
  },
  {
    "id": "meddpicc",
    "name": "MEDDPICC",
    "origin": "Extension of MEDDIC popularized by Force Management-adjacent practitioners; adds Paper process and Competition.",
    "summary": "MEDDIC plus two traits that kill late-stage deals: the Paper process (legal, security, procurement) and Competition (who else is in the deal, including 'do nothing'). Use over MEDDIC when contracts and rival vendors routinely decide outcomes.",
    "motion": "Enterprise sales with formal procurement and competitive bake-offs.",
    "traits": [
      {
        "id": "metrics",
        "name": "Metrics",
        "weight": 4,
        "rigor": "core",
        "definition": "Quantified business impact confirmed by the buyer.",
        "classifying_questions": [
          "Did the rep get the prospect to quantify the problem or the value of solving it?",
          "Are the numbers the prospect's own rather than the rep's assertions?"
        ],
        "met_signals": [
          "prospect states or confirms a number"
        ],
        "miss_signals": [
          "value only in adjectives"
        ],
        "coaching": {
          "why_it_matters": "Metrics are the ammunition your champion uses with finance.",
          "next_move": "Quantify the top pain from this call with the prospect and confirm it back.",
          "example_line": "Roughly what is that costing you per month today?"
        }
      },
      {
        "id": "economic_buyer",
        "name": "Economic Buyer",
        "weight": 4,
        "rigor": "standard",
        "definition": "The person with final budget authority and veto power, and your path to them.",
        "classifying_questions": [
          "Did the rep identify who signs and owns the budget?",
          "Was a step toward the economic buyer agreed?"
        ],
        "met_signals": [
          "named budget owner",
          "agreed path to meet them"
        ],
        "miss_signals": [
          "'leadership will decide' left unexplored"
        ],
        "coaching": {
          "why_it_matters": "Late-stage stalls are usually an unmet economic buyer.",
          "next_move": "Ask who signs and propose a specific joint step with them.",
          "example_line": "Whose budget funds this, and what would they need to see to approve it?"
        }
      },
      {
        "id": "decision_criteria",
        "name": "Decision Criteria",
        "weight": 3,
        "rigor": "standard",
        "definition": "The yardsticks vendors are compared on — and your influence over them.",
        "classifying_questions": [
          "Did the rep surface what the evaluation will be judged on?",
          "Did the rep try to shape a criterion in their favor?"
        ],
        "met_signals": [
          "criteria list stated",
          "rep plants a differentiator as a criterion"
        ],
        "miss_signals": [
          "demo with no known yardstick"
        ],
        "coaching": {
          "why_it_matters": "Unshaped criteria default to the incumbent's or loudest competitor's strengths.",
          "next_move": "Get the evaluation list and add one criterion you win outright.",
          "example_line": "What are the three things that will actually decide this comparison?"
        }
      },
      {
        "id": "decision_process",
        "name": "Decision Process",
        "weight": 3,
        "rigor": "standard",
        "definition": "Steps, approvers, and timeline from 'yes' to signature.",
        "classifying_questions": [
          "Did the rep map stages, approvers, and a target date?",
          "Is there a mutual plan anchored to a buyer-side event?"
        ],
        "met_signals": [
          "reverse timeline agreed"
        ],
        "miss_signals": [
          "no timeline anchor"
        ],
        "coaching": {
          "why_it_matters": "Every unmapped step is a slipped quarter.",
          "next_move": "Build a reverse timeline from the buyer's target date with owners per step.",
          "example_line": "Can we walk backwards from your go-live date and list every step and owner?"
        }
      },
      {
        "id": "paper_process",
        "name": "Paper Process",
        "weight": 3,
        "rigor": "deep",
        "definition": "The contractual path: legal review, security review, procurement, vendor onboarding — who runs it and how long it takes.",
        "classifying_questions": [
          "Did the rep ask what happens after a verbal yes — legal, security, procurement steps?",
          "Are typical durations or known bottlenecks for those steps surfaced?",
          "Did the rep offer to start a long-lead item early (security questionnaire, MSA redlines)?"
        ],
        "met_signals": [
          "procurement/legal steps named with rough durations",
          "security review started in parallel"
        ],
        "miss_signals": [
          "'then we sign' with no paper path",
          "surprise procurement portal at closing time"
        ],
        "coaching": {
          "why_it_matters": "Deals die in paperwork after every human has said yes — the paper process is where forecast slips are born.",
          "next_move": "Ask your contact to walk you through the last purchase like this one, step by step; start the longest-lead item now.",
          "example_line": "Last time you bought software like this, how long did security and legal take — and can we start that questionnaire this week?"
        }
      },
      {
        "id": "implicate_pain",
        "name": "Implicate the Pain",
        "weight": 5,
        "rigor": "core",
        "definition": "Beyond identifying a pain: deepening it until the buyer owns its severity — root cause, downstream consequences, cost of inaction (identify -> indicate -> implicate, per Andy Whyte's MEDDICC canon).",
        "classifying_questions": [
          "Beyond naming a pain, did the rep deepen it — root cause, downstream consequences, cost of inaction?",
          "Did the buyer's language shift to owning the pain ('we can't keep doing this')?",
          "Did the rep connect the pain to the buyer personally or departmentally, not just corporately?"
        ],
        "met_signals": [
          "buyer escalates the pain in their own words",
          "cost of doing nothing made explicit"
        ],
        "miss_signals": [
          "pain named once and immediately pitched at",
          "severity asserted by the rep, never confirmed"
        ],
        "coaching": {
          "why_it_matters": "An identified pain gets a meeting; an implicated pain gets a budget. Everything else hangs off a pain the buyer owns.",
          "next_move": "Take the strongest pain from this call one level deeper: root cause, who else it hurts, and what it costs to leave alone.",
          "example_line": "If nothing changes for two more quarters, what does that do to the renewal numbers — and who's answering for that?"
        }
      },
      {
        "id": "champion",
        "name": "Champion",
        "weight": 4,
        "rigor": "deep",
        "definition": "A tested internal advocate with power and personal stake.",
        "classifying_questions": [
          "Is someone on the buyer side actively selling this internally?",
          "Did the rep test their influence and equip them with materials?"
        ],
        "met_signals": [
          "contact arranges internal meetings",
          "rep supplies a business-case asset"
        ],
        "miss_signals": [
          "friendly contact assumed to be a champion"
        ],
        "coaching": {
          "why_it_matters": "A tested champion is your proxy in every meeting you are not in.",
          "next_move": "Hand your champion a one-pager with their metrics and watch whether they socialize it.",
          "example_line": "Would you walk your VP through this one-pager before our next call?"
        }
      },
      {
        "id": "competition",
        "name": "Competition",
        "weight": 3,
        "rigor": "deep",
        "definition": "Who else is being evaluated — vendors, internal builds, and the status quo — and your positioning against each.",
        "classifying_questions": [
          "Did the rep ask who else is being looked at (including doing nothing or building in-house)?",
          "Were the competitor's perceived strengths acknowledged and countered with a trap or differentiator?",
          "Did the rep learn where the buyer leans and why?"
        ],
        "met_signals": [
          "competitors named",
          "rep sets a trap question aimed at a rival's weakness"
        ],
        "miss_signals": [
          "rep never asks who else is in the deal",
          "badmouthing a competitor without positioning"
        ],
        "coaching": {
          "why_it_matters": "You are always competing with someone — a rival, an internal build, or inertia. Unknown competition writes the criteria without you.",
          "next_move": "Ask directly who else is in the evaluation and what they like about them; position against that, not against a generic rival.",
          "example_line": "Who else are you looking at — and what's the strongest thing you've seen from them so far?"
        }
      }
    ]
  },
  {
    "id": "neat",
    "name": "N.E.A.T. Selling",
    "origin": "Richard Harris, The Harris Consulting Group (with Sales Hacker). Trademarked N.E.A.T. Selling.",
    "summary": "A buyer-centric modernization of BANT: core Need (beneath the surface request), Economic impact (replaces Budget), Access to Authority (replaces Authority), and a Timeline anchored to a compelling event.",
    "motion": "SaaS / mid-market qualification; SDR-to-AE handoffs.",
    "traits": [
      {
        "id": "need",
        "name": "Need (core, not surface)",
        "weight": 4,
        "rigor": "core",
        "definition": "The deeper business need beneath the stated want — must-solve, not nice-to-have.",
        "classifying_questions": [
          "Did the rep dig beneath the stated want to the underlying business need?",
          "Did they distinguish nice-to-have from must-solve?"
        ],
        "met_signals": [
          "'what's driving that request?' asked",
          "core need articulated by the buyer"
        ],
        "miss_signals": [
          "surface request taken as the need",
          "no severity test"
        ],
        "coaching": {
          "why_it_matters": "Surface wants get quotes; core needs get purchase orders.",
          "next_move": "Ask what's behind the stated request until you reach the business problem it serves.",
          "example_line": "You asked about call recording — what's happening on the team that made that a priority now?"
        }
      },
      {
        "id": "economic_impact",
        "name": "Economic Impact",
        "weight": 4,
        "rigor": "standard",
        "definition": "What the problem costs today and what solving it is worth — confirmed by the buyer, not just 'we have budget'.",
        "classifying_questions": [
          "Did the rep quantify what the problem costs today and what solving it is worth?",
          "Did the buyer confirm the economic math rather than just asserting budget exists?"
        ],
        "met_signals": [
          "cost-of-problem and value-of-solution both discussed",
          "buyer validates the math"
        ],
        "miss_signals": [
          "only 'do you have budget?' asked",
          "impact never monetized"
        ],
        "coaching": {
          "why_it_matters": "Budget is a snapshot; economic impact is the argument that creates or expands budget.",
          "next_move": "Build the cost-of-problem number with the buyer before discussing price.",
          "example_line": "Before we talk price — what is this problem costing you per month right now, roughly?"
        }
      },
      {
        "id": "access_to_authority",
        "name": "Access to Authority",
        "weight": 4,
        "rigor": "standard",
        "definition": "Identifying the actual authority and securing a path to them — meeting, intro, or champion-carried message — with an honest test of the contact's influence.",
        "classifying_questions": [
          "Did the rep identify the actual authority and secure a path to them?",
          "Did they test the contact's influence honestly rather than assuming it?"
        ],
        "met_signals": [
          "a concrete access step agreed",
          "influence tested ('have you gotten something like this approved before?')"
        ],
        "miss_signals": [
          "authority assumed from title",
          "no access ask at all"
        ],
        "coaching": {
          "why_it_matters": "You rarely get the authority on the call — what you can always get is ACCESS, or the truth that there is none.",
          "next_move": "Ask your contact how they'd carry this to the decision-maker, and offer to equip or join them.",
          "example_line": "When you bring this to your CRO, what will they push back on — and would it help if we handled that part together?"
        }
      },
      {
        "id": "timeline",
        "name": "Timeline (compelling event)",
        "weight": 3,
        "rigor": "core",
        "definition": "Timing anchored to a compelling event with consequences — not an arbitrary date — and tested for slippage.",
        "classifying_questions": [
          "Did the rep anchor timing to a compelling event with consequences, not an arbitrary date?",
          "Did they test what happens if the date slips?"
        ],
        "met_signals": [
          "event named with a consequence",
          "slippage cost discussed"
        ],
        "miss_signals": [
          "'Q3 probably' accepted",
          "urgency invented by the rep"
        ],
        "coaching": {
          "why_it_matters": "A timeline without a compelling event is a wish with a date on it.",
          "next_move": "Find the event on the buyer's calendar that makes the date real; if none exists, requalify.",
          "example_line": "What breaks on your side if this isn't done by then?"
        }
      }
    ]
  },
  {
    "id": "sandler",
    "name": "Sandler Selling System",
    "origin": "David Sandler, 1967; Sandler (formerly Sandler Training). The 'Sandler Submarine'.",
    "summary": "Seven submarine compartments in order: Bonding & Rapport, Up-Front Contracts, Pain, Budget, Decision, Fulfillment, Post-Sell. Equal-footing, low-pressure selling: qualify hard (Pain -> Budget -> Decision) before ever presenting, and inoculate against remorse after the close.",
    "motion": "Mid-market consultative and full-cycle sellers; strong qualification discipline.",
    "traits": [
      {
        "id": "bonding_rapport",
        "name": "Bonding & Rapport",
        "weight": 2,
        "rigor": "core",
        "definition": "An equal-footing, low-pressure tone where the buyer speaks freely — no eager-seller behavior.",
        "classifying_questions": [
          "Did the rep establish an equal-footing, low-pressure tone (no eager-seller behavior)?",
          "Did they match the buyer's communication style?",
          "Was psychological safety evident — the buyer speaking freely, including about negatives?"
        ],
        "met_signals": [
          "buyer volunteers problems unprompted",
          "rep comfortable with silence and 'no'"
        ],
        "miss_signals": [
          "rep over-talks or over-agrees",
          "buyer gives guarded one-line answers throughout"
        ],
        "coaching": {
          "why_it_matters": "Sandler selling runs on the buyer telling you the truth; truth requires a peer dynamic, not a vendor dynamic.",
          "next_move": "Open the next call with a nurturing, no-pressure frame and one honest disqualifier to signal you're not desperate.",
          "example_line": "It may turn out we're not a fit — I'd rather we find that out together in the next twenty minutes than after a long demo."
        }
      },
      {
        "id": "upfront_contract",
        "name": "Up-Front Contracts",
        "weight": 4,
        "rigor": "core",
        "definition": "An explicit agreement at the start: purpose, time, both agendas, and the possible outcomes — including that 'no' is acceptable. Mini-contracts before transitions (demo, pricing).",
        "classifying_questions": [
          "Did the rep set an explicit agenda with time, purpose, and agreed possible outcomes at the start?",
          "Did both sides agree on what happens at the end of the call — including that 'no' is an acceptable outcome?",
          "Were mini-contracts set before transitions (e.g., before demoing or discussing pricing)?"
        ],
        "met_signals": [
          "'by the end of this call we'll decide X or Y' stated and agreed",
          "transition asks before the demo"
        ],
        "miss_signals": [
          "call drifts with no agreed outcome",
          "ends with 'I'll send some info over'"
        ],
        "coaching": {
          "why_it_matters": "Without a contract for the call, you get the mutual mystification Sandler warned about — polite endings and ghosted follow-ups.",
          "next_move": "Script a 30-second up-front contract and deliver it before anything else on the next call.",
          "example_line": "We've got 30 minutes. I'd like to ask about the dialer problems, you'll have questions for me, and at the end let's agree either on a next step or that it's not a fit — fair?"
        }
      },
      {
        "id": "pain",
        "name": "Pain (Pain Funnel)",
        "weight": 5,
        "rigor": "core",
        "definition": "Running the pain funnel — surface -> example -> impact -> personal cost — until the BUYER concludes the pain matters, quantified in money, time, or emotion.",
        "classifying_questions": [
          "Did the rep run a pain funnel — surface statement, concrete example, business impact, personal cost?",
          "Did they quantify the pain in money, time, or emotion?",
          "Did the buyer, not the rep, conclude that the pain matters?"
        ],
        "met_signals": [
          "'can you give me an example... what has that cost you... how do you feel about that?' progression",
          "buyer says some version of 'we have to fix this'"
        ],
        "miss_signals": [
          "first pain statement taken at face value",
          "rep supplies the impact narrative themselves"
        ],
        "coaching": {
          "why_it_matters": "People buy emotionally and justify intellectually — the funnel walks the buyer from a fact to a feeling they will pay to change.",
          "next_move": "Take this call's strongest surface pain and go two levels deeper next time: a concrete example, then what it costs them personally.",
          "example_line": "Can you give me a specific example of the last time that happened — and what did that end up costing you?"
        }
      },
      {
        "id": "budget",
        "name": "Budget",
        "weight": 3,
        "rigor": "standard",
        "definition": "Openly discussing whether the buyer is willing and able to invest money, time, and resources — BEFORE presenting.",
        "classifying_questions": [
          "Did the rep openly discuss whether the buyer is willing and able to invest (money, time, resources)?",
          "Was budget surfaced before any presenting or pricing reveal?",
          "Did they test comfort with the likely price range?"
        ],
        "met_signals": [
          "money discussed without flinching",
          "a range floated and reacted to"
        ],
        "miss_signals": [
          "price avoided until the proposal",
          "rep hopes the demo will justify the number later"
        ],
        "coaching": {
          "why_it_matters": "Presenting before budget is qualified is free consulting; Sandler qualifies the wallet before the show.",
          "next_move": "Introduce a money bracket in the qualification phase of the next call, matter-of-factly.",
          "example_line": "Teams your size typically invest between X and Y with us — is that in the universe of what you'd spend to fix this?"
        }
      },
      {
        "id": "decision",
        "name": "Decision",
        "weight": 3,
        "rigor": "standard",
        "definition": "Mapping the who, how, when, and why of the decision — process, parties, and timeline agreed.",
        "classifying_questions": [
          "Did the rep map who, how, and when the decision gets made?",
          "Were all parties involved in the decision uncovered?",
          "Did they get agreement on what the decision timeline looks like?"
        ],
        "met_signals": [
          "decision steps and people named",
          "timeline agreed with the buyer"
        ],
        "miss_signals": [
          "'send a proposal and we'll see' accepted",
          "unknown approvers at closing time"
        ],
        "coaching": {
          "why_it_matters": "A deal you can't map is a deal you can't forecast — surprises in the decision process are always bad ones.",
          "next_move": "Before fulfillment, walk the buyer through 'what happens between yes and signed?' and write the steps down together.",
          "example_line": "Suppose you love what you see — walk me through what happens next on your side, step by step."
        }
      },
      {
        "id": "fulfillment",
        "name": "Fulfillment",
        "weight": 2,
        "rigor": "standard",
        "definition": "Presenting ONLY against the pains qualified earlier — no feature dumping — and asking for a decision at the close, not a 'think it over'.",
        "classifying_questions": [
          "Did the presentation address only the pains uncovered earlier (no feature dumping)?",
          "Did the rep confirm the solution closes each qualified pain?",
          "Did they seek a decision at the close of fulfillment rather than accepting 'think it over'?"
        ],
        "met_signals": [
          "demo mapped pain-by-pain",
          "'does that solve the problem you described?' checks"
        ],
        "miss_signals": [
          "full product tour regardless of pains",
          "call ends on 'we'll think about it' unchallenged"
        ],
        "coaching": {
          "why_it_matters": "Every feature beyond the qualified pains adds risk and price objections without adding desire.",
          "next_move": "Structure the next demo as a checklist of their three pains; ask for a thumbs-up-or-down after each.",
          "example_line": "You said missed follow-ups were the killer — here's exactly and only how that goes away. Does this close it?"
        }
      },
      {
        "id": "post_sell",
        "name": "Post-Sell",
        "weight": 2,
        "rigor": "deep",
        "definition": "Inoculating against buyer's remorse and competitor pull-back after the yes; locking next steps and onboarding.",
        "classifying_questions": [
          "Did the rep inoculate against remorse ('is there anything that could reverse this decision?')?",
          "Did they proactively surface competitor pull-back or internal second-guessing?",
          "Did they lock concrete next steps or onboarding before ending?"
        ],
        "met_signals": [
          "'what could derail this between now and signature?' asked",
          "onboarding step scheduled on the call"
        ],
        "miss_signals": [
          "celebration then silence",
          "no rehearsal of the internal pushback the champion will face"
        ],
        "coaching": {
          "why_it_matters": "Deals unravel in the 48 hours after yes, when the incumbent calls back and finance asks 'why now?' — inoculate before you hang up.",
          "next_move": "After the next verbal yes, ask what could reverse it and rehearse the buyer's answer to their toughest internal skeptic.",
          "example_line": "Before we book onboarding — is there anyone or anything that could unwind this decision next week? Let's handle it now."
        }
      }
    ]
  },
  {
    "id": "snap",
    "name": "SNAP Selling",
    "origin": "Jill Konrath — 'SNAP Selling' (2010).",
    "summary": "Selling to frazzled, overloaded buyers: keep it Simple, be iNvaluable, always Align, raise Priorities. Wins the three buyer decisions — allow access, initiate change, select resources — by being the easiest, most expert, most relevant option on the buyer's crowded desk.",
    "motion": "Fast-cycle, transactional to mid-market; SDR outreach and early-stage calls with busy buyers.",
    "traits": [
      {
        "id": "simple",
        "name": "Keep it Simple",
        "weight": 3,
        "rigor": "core",
        "definition": "Trivially easy next steps and jargon-free, digestible explanations — no overwhelming a distracted buyer with options.",
        "classifying_questions": [
          "Did the rep make the next step trivially easy — clear, low-effort asks?",
          "Was the explanation jargon-free and digestible for a distracted buyer?",
          "Did they avoid overwhelming the buyer with options, features, or slides?"
        ],
        "met_signals": [
          "one clear ask, one date",
          "plain-language framing"
        ],
        "miss_signals": [
          "three-option proposals on a first call",
          "acronym soup"
        ],
        "coaching": {
          "why_it_matters": "Frazzled buyers default to whatever costs the least mental energy — complexity is a competitor.",
          "next_move": "Reduce your next-step ask to one sentence a busy person can say yes to from their phone.",
          "example_line": "One 20-minute working session with your ops lead next Tuesday — I'll bring everything. Yes or no?"
        }
      },
      {
        "id": "invaluable",
        "name": "Be iNvaluable",
        "weight": 4,
        "rigor": "core",
        "definition": "Bringing expertise beyond product info — the buyer learns something useful even if they never buy.",
        "classifying_questions": [
          "Did the rep bring expertise or insight beyond product information?",
          "Did they share relevant knowledge of the buyer's business or peers?",
          "Would the buyer have learned something valuable even without buying?"
        ],
        "met_signals": [
          "benchmark or peer practice shared",
          "buyer asks the rep's opinion"
        ],
        "miss_signals": [
          "all product, no perspective",
          "rep can't answer 'what do teams like ours do?'"
        ],
        "coaching": {
          "why_it_matters": "Access is granted to experts, not vendors — being invaluable is what earns the second meeting.",
          "next_move": "Prepare one piece of genuinely useful peer insight for the next touch, offered with no strings.",
          "example_line": "Whether or not you go with us: the top quartile of teams your size run this exact play — want me to walk you through it?"
        }
      },
      {
        "id": "align",
        "name": "Always Align",
        "weight": 4,
        "rigor": "core",
        "definition": "Connecting everything to the buyer's stated objectives and business outcomes — never product-centric talking points.",
        "classifying_questions": [
          "Did the rep connect everything to the buyer's stated objectives and core priorities?",
          "Did they demonstrate relevance to the buyer's business outcomes rather than product talking points?"
        ],
        "met_signals": [
          "buyer's own goals quoted back and built on",
          "value framed in the buyer's metric"
        ],
        "miss_signals": [
          "pitch identical to any other prospect's",
          "objectives never asked"
        ],
        "coaching": {
          "why_it_matters": "Overloaded buyers filter ruthlessly for relevance — anything not aligned to their objectives is deleted on arrival.",
          "next_move": "Restate the buyer's #1 objective in their words at the top of your next message, and tie every point to it.",
          "example_line": "You said the whole year hinges on the Q1 launch — everything I'm about to show you is in service of that date."
        }
      },
      {
        "id": "priorities",
        "name": "Raise Priorities",
        "weight": 4,
        "rigor": "core",
        "definition": "Tying the solution to what is ALREADY a top priority — active initiatives and deadlines — rather than trying to manufacture a new one.",
        "classifying_questions": [
          "Did the rep tie the solution to something already a top priority for the buyer?",
          "Did they create urgency by linking to active initiatives or deadlines?",
          "Did they keep that priority front-of-mind in the close and next steps?"
        ],
        "met_signals": [
          "solution attached to a named initiative",
          "next step scheduled against the buyer's deadline"
        ],
        "miss_signals": [
          "urgency manufactured from the rep's quarter-end",
          "priority never established"
        ],
        "coaching": {
          "why_it_matters": "Budgets follow existing priorities; creating a brand-new priority from scratch is the slowest sale there is.",
          "next_move": "Find the buyer's active initiative this maps to and reposition the deal as an accelerant to it.",
          "example_line": "This isn't a new project — it's the fastest path to the rollout you've already committed to."
        }
      }
    ]
  },
  {
    "id": "solution",
    "name": "Solution Selling (PPVVC)",
    "origin": "Michael Bosworth (1994) / Keith Eades 'The New Solution Selling' (2003), Sales Performance International. PPVVC is the Eades-era qualification skeleton.",
    "summary": "Pain, Power, Vision, Value, Control: move the buyer from latent to admitted pain, align with power, co-create a buying vision biased to your differentiators, quantify mutual value, and control the evaluation with a mutual plan.",
    "motion": "Enterprise/complex, discovery-heavy motions; the parent of much modern consultative selling.",
    "traits": [
      {
        "id": "pain",
        "name": "Pain (latent -> admitted)",
        "weight": 5,
        "rigor": "core",
        "definition": "Moving the buyer from latent to admitted pain — the buyer states it explicitly — diagnosing reasons before prescribing, and tracing the pain chain to other stakeholders.",
        "classifying_questions": [
          "Did the rep move the buyer from latent to admitted pain (the buyer states it explicitly)?",
          "Did they diagnose reasons before prescribing anything?",
          "Did they trace the pain chain to other stakeholders or executives?"
        ],
        "met_signals": [
          "buyer owns the problem out loud",
          "pain linked to another team's or an exec's pain"
        ],
        "miss_signals": [
          "prescription before diagnosis",
          "pain remains hypothetical ('some teams struggle with...')"
        ],
        "coaching": {
          "why_it_matters": "No pain, no change — and un-admitted pain is no pain. The pain chain turns one sponsor's problem into an organizational one.",
          "next_move": "Get the buyer to state the pain in their own words, then ask whose pain it becomes upstream.",
          "example_line": "When your reps lose those hours, whose number does that eventually show up in above you?"
        }
      },
      {
        "id": "power",
        "name": "Power",
        "weight": 4,
        "rigor": "standard",
        "definition": "Identifying and reaching (or planning access to) the person with power to buy — distinguishing sponsor from power sponsor.",
        "classifying_questions": [
          "Did the rep identify the person with power to make this purchase happen?",
          "Did they distinguish their sponsor from the power sponsor?",
          "Was access to power gained or credibly planned?"
        ],
        "met_signals": [
          "power sponsor named",
          "sponsor agrees to broker access"
        ],
        "miss_signals": [
          "selling exclusively to a sponsor who can't buy",
          "access never requested"
        ],
        "coaching": {
          "why_it_matters": "Sponsors give you information; only power gives you a decision.",
          "next_move": "Test your sponsor: ask them to arrange a specific step with the power sponsor and watch what happens.",
          "example_line": "For this to move, we'll eventually need [the VP] in the room — could you get us thirty minutes together next week?"
        }
      },
      {
        "id": "vision",
        "name": "Vision (biased to you)",
        "weight": 4,
        "rigor": "standard",
        "definition": "Helping the buyer visualize specific capabilities ('what if you could...') rather than pitching features — a vision the buyer articulates back, biased toward your differentiators.",
        "classifying_questions": [
          "Did the rep help the buyer visualize capabilities ('what if you could...') rather than pitch features?",
          "Is the created vision biased toward the rep's differentiators?",
          "Did the buyer articulate the vision back in their own words?"
        ],
        "met_signals": [
          "'what if when a call ended, the CRM just updated itself?' style questions",
          "buyer repeats the vision as their own"
        ],
        "miss_signals": [
          "feature list with no visualization",
          "vision generic enough that any vendor fits it"
        ],
        "coaching": {
          "why_it_matters": "Buyers act on visions they can see themselves in — and evaluate every vendor against whoever authored the vision.",
          "next_move": "Convert your top two differentiators into 'what if you could...' questions for the next call.",
          "example_line": "What if every call ended with the summary, the follow-up, and the CRM fields already done — what would that change for the team?"
        }
      },
      {
        "id": "value",
        "name": "Value",
        "weight": 4,
        "rigor": "standard",
        "definition": "Value quantified and agreed WITH the buyer — cost of the pain vs value of the capability, in the buyer's numbers.",
        "classifying_questions": [
          "Was the value quantified and agreed with the buyer (cost of pain vs value of capability)?",
          "Was value expressed in the buyer's numbers rather than the rep's benchmarks?"
        ],
        "met_signals": [
          "a value figure computed together on the call",
          "buyer's own inputs used"
        ],
        "miss_signals": [
          "generic ROI slide",
          "value asserted, never agreed"
        ],
        "coaching": {
          "why_it_matters": "Mutual value survives procurement; asserted value dies at the first discount request.",
          "next_move": "Build the value math live with the buyer's own numbers and get an explicit 'yes, that's roughly right'.",
          "example_line": "Using your numbers — 12 reps, 5 hours each — that's about $18K a month. Does that math hold up from where you sit?"
        }
      },
      {
        "id": "control",
        "name": "Control (mutual plan)",
        "weight": 3,
        "rigor": "deep",
        "definition": "Controlling the buying process: a proposed or maintained evaluation/mutual plan with agreed next steps and timeline governance.",
        "classifying_questions": [
          "Did the rep propose or maintain an evaluation or mutual plan?",
          "Did they secure agreed next steps and timeline governance?"
        ],
        "met_signals": [
          "a written plan referenced or offered",
          "each step dated with an owner"
        ],
        "miss_signals": [
          "buyer fully dictates an opaque process",
          "next step is 'we'll get back to you'"
        ],
        "coaching": {
          "why_it_matters": "Whoever runs the plan runs the deal — an uncontrolled evaluation is one your competitor is controlling.",
          "next_move": "Send a short mutual plan after this call: steps, owners, dates, and the go-live it all serves.",
          "example_line": "I'll draft a one-page plan from today through your go-live date — you correct it, and then we both work the same list."
        }
      }
    ]
  },
  {
    "id": "spiced",
    "name": "SPICED",
    "origin": "Winning by Design (Jacco van der Kooij) — open framework from Revenue Architecture.",
    "summary": "Situation, Pain, Impact, Critical Event, Decision — built for recurring-revenue businesses and the full customer lifecycle (SDR -> AE -> CS). Note: Critical Event is ONE component (C+E); the deadline must be the buyer's, with a real consequence for missing it.",
    "motion": "SaaS / recurring revenue, full lifecycle including CS and expansion calls; the leading MEDDIC alternative for PLG and mid-market SaaS.",
    "traits": [
      {
        "id": "situation",
        "name": "Situation",
        "weight": 2,
        "rigor": "core",
        "definition": "Key facts confirmed efficiently — research used to validate rather than asking cold.",
        "classifying_questions": [
          "Did the rep confirm key facts (stack, team, model) without over-interrogating?",
          "Did they use research to validate rather than ask cold?"
        ],
        "met_signals": [
          "'I saw you're on X — still right?' confirmations"
        ],
        "miss_signals": [
          "long fact-finding interrogation"
        ],
        "coaching": {
          "why_it_matters": "Situation earns you the right to ask about pain — but spends buyer patience fast.",
          "next_move": "Move situation facts into pre-call research; confirm in one breath, then go to pain.",
          "example_line": "Quick check on what I read: 40 reps, JustCall dialer, HubSpot CRM — did I get that right?"
        }
      },
      {
        "id": "pain",
        "name": "Pain",
        "weight": 4,
        "rigor": "core",
        "definition": "The problems behind the initiative, with the buyer confirming which pain is primary.",
        "classifying_questions": [
          "Did the rep uncover the pains behind the initiative?",
          "Did the buyer confirm which pain is primary?"
        ],
        "met_signals": [
          "multiple pains surfaced and ranked",
          "buyer names the top one"
        ],
        "miss_signals": [
          "single surface pain accepted",
          "rep guesses the priority"
        ],
        "coaching": {
          "why_it_matters": "Solving the wrong pain first is how good products churn — the primary pain sets the success criteria for everything after the sale.",
          "next_move": "List the pains you heard and ask the buyer to rank them.",
          "example_line": "I heard three problems: missed follow-ups, no coaching visibility, manual CRM entry. Which one actually hurts most?"
        }
      },
      {
        "id": "impact",
        "name": "Impact",
        "weight": 5,
        "rigor": "core",
        "definition": "The measurable business outcome of solving (or not solving) the pain — rational AND emotional — with the buyer confirming the figure.",
        "classifying_questions": [
          "Did the rep quantify the business impact of solving the pain — the number the buyer cares about?",
          "Did they capture emotional impact as well as rational?",
          "Did the buyer confirm the impact figure?"
        ],
        "met_signals": [
          "an impact number confirmed by the buyer",
          "personal/emotional stake acknowledged"
        ],
        "miss_signals": [
          "impact in adjectives",
          "rep's ROI math with no buyer confirmation"
        ],
        "coaching": {
          "why_it_matters": "Impact is what SPICED trades on: it's the number that justifies the deal, the success plan, and later the renewal.",
          "next_move": "Convert the primary pain to a number with the buyer, and ask what it means for them personally.",
          "example_line": "If follow-ups stopped slipping, what does that do to the pipeline number — and what would that mean for you this year?"
        }
      },
      {
        "id": "critical_event",
        "name": "Critical Event",
        "weight": 4,
        "rigor": "standard",
        "definition": "A specific date or event that forces action — with a real consequence for missing it. The event must be the buyer's, not an artificial rep-created deadline.",
        "classifying_questions": [
          "Did the rep identify a specific date or event that forces action (board meeting, contract expiry, launch)?",
          "Did they establish the consequence of missing that date?",
          "Is the event the buyer's own, not a rep-manufactured deadline?"
        ],
        "met_signals": [
          "a dated buyer event named",
          "'what happens if you miss it?' asked and answered"
        ],
        "miss_signals": [
          "'end of quarter' with no consequence",
          "urgency borrowed from the rep's quota"
        ],
        "coaching": {
          "why_it_matters": "No critical event, no forecastable close date — the deal will slip because nothing breaks if it does.",
          "next_move": "Hunt the calendar: contract renewals, launches, board dates. Anchor the mutual plan to the first real one.",
          "example_line": "Is there a date on your side where not having this solved actually breaks something?"
        }
      },
      {
        "id": "decision",
        "name": "Decision",
        "weight": 3,
        "rigor": "standard",
        "definition": "The decision process, criteria, and buying committee — validated steps to signature.",
        "classifying_questions": [
          "Did the rep map the decision process, criteria, and who's on the buying committee?",
          "Did they validate the steps to signature rather than assume them?"
        ],
        "met_signals": [
          "committee members and criteria named",
          "steps to signature confirmed by the buyer"
        ],
        "miss_signals": [
          "process assumed from the last deal",
          "criteria unknown at proposal time"
        ],
        "coaching": {
          "why_it_matters": "The decision map is what turns an interested champion into a closed deal without quarter-end surprises.",
          "next_move": "Ask who's on the committee, what they'll judge on, and what the path to signature looks like — then write it into the mutual plan.",
          "example_line": "Who else weighs in on this, and what will each of them want to see before they're comfortable?"
        }
      }
    ]
  },
  {
    "id": "spin",
    "name": "SPIN Selling",
    "origin": "Neil Rackham / Huthwaite International, 1988 — from analysis of 35,000+ sales calls.",
    "summary": "Discovery-question craft: Situation, Problem, Implication, Need-payoff. Rackham's finding: Implication and Need-payoff questions correlate with success in large sales; excessive Situation questions correlate with failure — this pack penalizes situation-question overload.",
    "motion": "Discovery-heavy consultative selling; a call-quality rubric that layers under any qualification framework.",
    "traits": [
      {
        "id": "situation",
        "name": "Situation questions (efficient, researched)",
        "weight": 2,
        "rigor": "core",
        "definition": "Factual context gathered efficiently — pre-researched where possible. Scoring note: FEWER is better; a call dominated by situation questions is a miss.",
        "classifying_questions": [
          "Did the rep gather factual context (stack, team, process) efficiently, without interrogating?",
          "Was situational information clearly pre-researched and confirmed, rather than asked cold and redundantly?",
          "Was the share of situation questions small relative to problem/implication questions?"
        ],
        "met_signals": [
          "'I saw you use X — still true?' confirmations",
          "quick transition into problems"
        ],
        "miss_signals": [
          "long stretches of census-taking",
          "questions answerable from the prospect's website"
        ],
        "coaching": {
          "why_it_matters": "Every situation question spends buyer patience without building value — Rackham found they correlate with LOSING large deals.",
          "next_move": "Move three of your situation questions into pre-call research and open the next call by confirming, not asking.",
          "example_line": "I saw you run a 40-rep SDR team on a mix of dialers — did I get that right? Then let me ask about what's not working."
        }
      },
      {
        "id": "problem",
        "name": "Problem questions",
        "weight": 3,
        "rigor": "core",
        "definition": "Questions that surface difficulties, dissatisfactions, or gaps — in more than one area.",
        "classifying_questions": [
          "Did the rep ask questions that surfaced difficulties, dissatisfactions, or gaps?",
          "Did the buyer state explicit problems in response?",
          "Did the rep explore more than one problem area rather than stopping at the first?"
        ],
        "met_signals": [
          "buyer names concrete frustrations",
          "two or more problem areas opened"
        ],
        "miss_signals": [
          "straight from context to demo",
          "problems asserted by the rep, not elicited"
        ],
        "coaching": {
          "why_it_matters": "Problems are the raw material of the sale — implied needs you can later develop into explicit ones.",
          "next_move": "For each area of the prospect's workflow, prepare one 'where does this break down?' question.",
          "example_line": "Where does the current process most often break down for the team?"
        }
      },
      {
        "id": "implication",
        "name": "Implication questions",
        "weight": 5,
        "rigor": "standard",
        "definition": "Extending a stated problem into its consequences — cost, risk, ripple effects on other teams and KPIs — ideally quantified.",
        "classifying_questions": [
          "Did the rep extend a stated problem into its consequences (cost, risk, ripple effects on other teams or KPIs)?",
          "Did the buyer acknowledge the problem is bigger or more urgent than they first framed it?",
          "Did any implication get quantified?"
        ],
        "met_signals": [
          "'what does that do to...?' chains",
          "buyer upgrades their own assessment of the problem"
        ],
        "miss_signals": [
          "problem noted, immediately answered with a feature",
          "consequences narrated by the rep instead of asked"
        ],
        "coaching": {
          "why_it_matters": "Implication questions are the single strongest predictor of success in large sales — they grow a small admitted problem into one worth paying to fix.",
          "next_move": "Take the top problem from this call and script three consequence questions: cost, risk, and who else it touches.",
          "example_line": "When follow-ups slip like that, what does it do to the pipeline the leadership team reports on?"
        }
      },
      {
        "id": "need_payoff",
        "name": "Need-payoff questions",
        "weight": 4,
        "rigor": "standard",
        "definition": "Getting the BUYER to articulate the value of solving the problem — the buyer states the payoff, not the rep.",
        "classifying_questions": [
          "Did the rep ask what it would mean or be worth if the problem were solved?",
          "Did the buyer voice explicit needs or benefits in their own words?",
          "Did the rep let the buyer state the payoff rather than pitching it at them?"
        ],
        "met_signals": [
          "'how would that help?' questions",
          "buyer describes the better future themselves"
        ],
        "miss_signals": [
          "rep narrates ROI while buyer listens",
          "no bridge from problem to value before the pitch"
        ],
        "coaching": {
          "why_it_matters": "Value the buyer articulates themselves is value they defend internally; value you asserted is forgotten by the elevator.",
          "next_move": "Before demoing anything next call, ask one 'if this were solved, what would it unlock?' question and let the silence work.",
          "example_line": "If reps got those five hours a week back, what would you have them do with them?"
        }
      }
    ]
  },
  {
    "id": "value-selling",
    "name": "ValueSelling Framework",
    "origin": "ValueSelling Associates (originated at Wang Labs; long led by Julie Thomas). Canonical artifacts: Qualified Prospect Formula and Value Prompter.",
    "summary": "Qualified Prospect = VisionMatch(Differentiated) x Value x Power x Plan — multiplicative: any element at zero means unqualified. Anchor to a C-level business issue, build a differentiated vision the buyer confirms, a time-bound measurable business case, access to power, and a mutual plan.",
    "motion": "Enterprise / considered B2B; strong forecast-inspection rubric.",
    "traits": [
      {
        "id": "vision_match",
        "name": "Business Issue & VisionMatch (Differentiated)",
        "weight": 4,
        "rigor": "standard",
        "definition": "Anchoring to a C-level business issue (not just a departmental problem), with the buyer confirming your solution vision addresses it — differentiated from alternatives.",
        "classifying_questions": [
          "Did the rep anchor to a C-level business issue rather than only a departmental problem?",
          "Did the buyer confirm the solution vision addresses it?",
          "Did the rep differentiate that vision from the alternatives?"
        ],
        "met_signals": [
          "problem tied to an executive-level issue",
          "buyer confirms the vision fits"
        ],
        "miss_signals": [
          "conversation stays departmental",
          "vision generic across vendors"
        ],
        "coaching": {
          "why_it_matters": "In the multiplicative formula, no confirmed differentiated vision means the whole product is zero — everything else can't compensate.",
          "next_move": "Connect the departmental pain upward to the business issue an executive owns, and get the buyer to confirm the linkage.",
          "example_line": "The manual CRM work is the symptom — the business issue is forecast reliability. Is that how your CFO would frame it?"
        }
      },
      {
        "id": "value",
        "name": "Value",
        "weight": 4,
        "rigor": "standard",
        "definition": "A time-bound, measurable business case the buyer agrees justifies the investment — organizational and personal.",
        "classifying_questions": [
          "Did the rep build a measurable, time-bound business case?",
          "Did the buyer agree the value justifies the cost?",
          "Was value personal as well as organizational?"
        ],
        "met_signals": [
          "value with numbers and a timeframe",
          "buyer agreement captured"
        ],
        "miss_signals": [
          "value discussed without numbers or dates",
          "personal win never explored"
        ],
        "coaching": {
          "why_it_matters": "Value at zero zeroes the deal — and undated value is unprovable value.",
          "next_move": "Add a timeframe to every value claim and confirm both the number and the date with the buyer.",
          "example_line": "So that's roughly $200K recovered within two quarters of go-live — do you buy that math?"
        }
      },
      {
        "id": "power",
        "name": "Power",
        "weight": 4,
        "rigor": "standard",
        "definition": "The person who can approve and fund the decision identified, with gained or planned access — testing whether your contact can get you there.",
        "classifying_questions": [
          "Did the rep identify the person with power to approve or fund the decision?",
          "Did they gain or plan access to that person?",
          "Did they test whether the contact can get them there?"
        ],
        "met_signals": [
          "power person named",
          "access step agreed or influence honestly tested"
        ],
        "miss_signals": [
          "power assumed",
          "contact's influence never probed"
        ],
        "coaching": {
          "why_it_matters": "Deals without access to power are forecast risks, not commitments — power at zero zeroes the formula.",
          "next_move": "Ask your contact directly whether they can get you to the funder, and propose the specific meeting.",
          "example_line": "Who ultimately funds this — and can the three of us get thirty minutes together before the proposal?"
        }
      },
      {
        "id": "plan",
        "name": "Plan",
        "weight": 3,
        "rigor": "deep",
        "definition": "A mutual plan covering issue, solution, value, buying steps, and value realization — with dates, and the buyer committed to it.",
        "classifying_questions": [
          "Did the rep propose a mutual plan with steps, dates, and value-realization milestones?",
          "Did the buyer commit to the plan?"
        ],
        "met_signals": [
          "plan proposed or referenced with dates",
          "buyer agrees to own steps"
        ],
        "miss_signals": [
          "next steps vague or one-sided",
          "no milestone past the signature"
        ],
        "coaching": {
          "why_it_matters": "The plan converts intent into forecastable steps — and extending it past signature into value realization is what protects the renewal.",
          "next_move": "Draft the mutual plan through value realization (not just signature) and ask the buyer to edit it.",
          "example_line": "Here's a plan from today to your first measurable result in Q2 — mark up anything that's wrong and let's run it together."
        }
      }
    ]
  }
],
);
