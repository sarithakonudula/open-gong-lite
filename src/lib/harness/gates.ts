import {
  Claim,
  DealNotes,
  DealNotesSchema,
  GateFailure,
  TranscriptLine,
} from "@/lib/types";

/** Locked L7-style receipt chain — quote fidelity, not fuzzy paraphrase. */
export type EvidenceVerdict =
  | "match_exact"
  | "match_normalized"
  | "segment_corrected"
  | "uncorroborated"
  | "missing_line";

export type EvidenceGateResult = {
  verdict: EvidenceVerdict;
  /** Line that actually supports the quote (may differ on segment_corrected). */
  matchedLineId: string | null;
  stage: 1 | 2 | 3 | 4;
};

/** Long unique quotes may be rescued across the whole transcript (L7 stage 3). */
const RESCUE_MIN_WORDS = 6;

/**
 * Normalize for containment checks: lowercase, strip punctuation, collapse
 * whitespace. Digits are kept — no "forty" ↔ "40" folding.
 */
export function normalizeQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function neighbors(
  transcript: TranscriptLine[],
  lineId: string,
): TranscriptLine[] {
  const claimed = transcript.find((l) => l.id === lineId);
  if (!claimed) return [];
  return transcript.filter((l) => Math.abs(l.index - claimed.index) <= 1);
}

/**
 * Four-stage evidence chain (Lane 10 / L7):
 * 1. Exact substring in claimed line ±1
 * 2. Normalized containment in claimed line ±1 (no digit folding)
 * 3. Whole-transcript rescue for long unique quotes → segment_corrected
 * 4. uncorroborated
 */
export function gateEvidenceQuote(
  quote: string,
  lineId: string,
  transcript: TranscriptLine[],
): EvidenceGateResult {
  const byId = new Map(transcript.map((l) => [l.id, l]));
  if (!byId.has(lineId)) {
    return { verdict: "missing_line", matchedLineId: null, stage: 4 };
  }

  const window = neighbors(transcript, lineId);

  // Stage 1: exact substring in named segment ±1
  for (const line of window) {
    if (line.text.includes(quote)) {
      return { verdict: "match_exact", matchedLineId: line.id, stage: 1 };
    }
  }

  // Stage 2: normalized containment, same ±1 window
  const normQuote = normalizeQuote(quote);
  if (normQuote) {
    for (const line of window) {
      if (normalizeQuote(line.text).includes(normQuote)) {
        return {
          verdict: "match_normalized",
          matchedLineId: line.id,
          stage: 2,
        };
      }
    }
  }

  // Stage 3: whole-transcript rescue — long + unique only
  const wordCount = normQuote.split(" ").filter(Boolean).length;
  if (normQuote && wordCount >= RESCUE_MIN_WORDS) {
    const hits = transcript.filter((line) =>
      normalizeQuote(line.text).includes(normQuote),
    );
    if (hits.length === 1) {
      return {
        verdict: "segment_corrected",
        matchedLineId: hits[0]!.id,
        stage: 3,
      };
    }
  }

  return { verdict: "uncorroborated", matchedLineId: null, stage: 4 };
}

type ClaimPath = { path: string; claim: Claim };

function collectClaims(notes: DealNotes): ClaimPath[] {
  return [
    ...notes.summary.map((c, i) => ({ path: `summary[${i}]`, claim: c })),
    ...notes.objections.map((c, i) => ({
      path: `objections[${i}]`,
      claim: c,
    })),
    ...notes.intent.map((c, i) => ({ path: `intent[${i}]`, claim: c })),
    ...notes.nextSteps.map((c, i) => ({
      path: `nextSteps[${i}]`,
      claim: c,
    })),
    {
      path: "followUpEmail",
      claim: {
        text: notes.followUpEmail.subject,
        evidence: notes.followUpEmail.evidence,
      },
    },
  ];
}

function applyLineCorrection(notes: DealNotes, path: string, lineId: string) {
  if (path === "followUpEmail") {
    notes.followUpEmail.evidence.lineId = lineId;
    return;
  }
  const match = path.match(/^(summary|objections|intent|nextSteps)\[(\d+)\]$/);
  if (!match) return;
  const key = match[1] as "summary" | "objections" | "intent" | "nextSteps";
  const index = Number(match[2]);
  const claim = notes[key][index];
  if (claim) claim.evidence.lineId = lineId;
}

export function validateDealNotes(
  raw: unknown,
  transcript: TranscriptLine[],
): { ok: true; notes: DealNotes } | { ok: false; failures: GateFailure[] } {
  const failures: GateFailure[] = [];
  const parsed = DealNotesSchema.safeParse(raw);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      failures.push({
        code: "bad_json_schema",
        message: issue.message,
        path: issue.path.join("."),
      });
    }
    return { ok: false, failures };
  }

  // Clone so segment_corrected can rewrite lineIds without mutating caller input.
  const notes = structuredClone(parsed.data) as DealNotes;

  for (const { path, claim } of collectClaims(notes)) {
    const gate = gateEvidenceQuote(
      claim.evidence.quote,
      claim.evidence.lineId,
      transcript,
    );

    if (gate.verdict === "missing_line") {
      failures.push({
        code: "missing_evidence_line",
        message: `Evidence lineId ${claim.evidence.lineId} not in transcript`,
        path,
      });
      continue;
    }

    if (gate.verdict === "uncorroborated") {
      failures.push({
        code: "unproven_claim",
        message: `Quote not corroborated in transcript (no exact/normalized match; digit folding not allowed)`,
        path,
      });
      continue;
    }

    if (
      gate.verdict === "segment_corrected" &&
      gate.matchedLineId &&
      gate.matchedLineId !== claim.evidence.lineId
    ) {
      applyLineCorrection(notes, path, gate.matchedLineId);
    }
  }

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, notes };
}
