import { chokeFollowUp } from "@/lib/harness/email";
import { screenClaim, screenTranscript } from "@/lib/harness/injection";
import {
  Claim,
  ClaimStatus,
  Coverage,
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

const REQUIRED_SECTIONS = ["summary", "intent", "nextSteps"] as const;

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

  for (const line of window) {
    if (line.text.includes(quote)) {
      return { verdict: "match_exact", matchedLineId: line.id, stage: 1 };
    }
  }

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

function verdictToStatus(verdict: EvidenceVerdict): ClaimStatus {
  if (verdict === "segment_corrected") return "segment_corrected";
  if (verdict === "match_exact" || verdict === "match_normalized") {
    return "verified";
  }
  return "uncorroborated";
}

type ClaimPath = {
  path: string;
  section: keyof Pick<
    DealNotes,
    | "summary"
    | "objections"
    | "intent"
    | "nextSteps"
    | "pain"
    | "pricing"
    | "competitors"
  >;
  index: number;
  claim: Claim;
};

function collectClaims(notes: DealNotes): ClaimPath[] {
  const sections = [
    "summary",
    "objections",
    "intent",
    "nextSteps",
    "pain",
    "pricing",
    "competitors",
  ] as const;
  const out: ClaimPath[] = [];
  for (const section of sections) {
    notes[section].forEach((claim, index) => {
      out.push({
        path: `${section}[${index}]`,
        section,
        index,
        claim,
      });
    });
  }
  return out;
}

function gradeClaim(
  claim: Claim,
  path: string,
  transcript: TranscriptLine[],
  tainted: Map<string, string[]>,
): Claim {
  const injection = screenClaim({
    text: claim.text,
    lineId: claim.evidence.lineId,
    tainted,
  });
  const gate = gateEvidenceQuote(
    claim.evidence.quote,
    claim.evidence.lineId,
    transcript,
  );

  let status: ClaimStatus;
  let lineId = claim.evidence.lineId;
  if (injection.blocked) {
    status = "blocked_injection";
  } else {
    status = verdictToStatus(gate.verdict);
    if (
      gate.verdict === "segment_corrected" &&
      gate.matchedLineId &&
      gate.matchedLineId !== claim.evidence.lineId
    ) {
      lineId = gate.matchedLineId;
    }
  }

  return {
    ...claim,
    id: claim.id || path,
    status,
    blockedReasons: injection.blocked ? injection.reasons : undefined,
    evidence: { ...claim.evidence, lineId },
  };
}

export function gradeCoverage(claims: Claim[]): Coverage {
  const attempted = claims.filter((c) => c.status !== "blocked_injection");
  const stats = {
    verified: claims.filter((c) => c.status === "verified").length,
    segment_corrected: claims.filter((c) => c.status === "segment_corrected")
      .length,
    uncorroborated: claims.filter((c) => c.status === "uncorroborated").length,
    blocked_injection: claims.filter((c) => c.status === "blocked_injection")
      .length,
    attempted: attempted.length,
    corroborated: attempted.filter(
      (c) => c.status === "verified" || c.status === "segment_corrected",
    ).length,
  };
  const ratio =
    stats.attempted === 0 ? (stats.blocked_injection > 0 ? 0 : 1) : stats.corroborated / stats.attempted;

  const requiredUnproven = REQUIRED_SECTIONS.some((section) => {
    const inSection = claims.filter((c) => (c.id || "").startsWith(`${section}[`));
    const survived = inSection.filter((c) => c.status !== "blocked_injection");
    if (!survived.length) return inSection.length > 0;
    return !survived.some(
      (c) => c.status === "verified" || c.status === "segment_corrected",
    );
  });

  let band: Coverage["band"];
  if (stats.corroborated === 0 || requiredUnproven) band = "FAILED_UNPROVEN";
  else if (ratio < 0.5) band = "PARTIAL_LOW_COVERAGE";
  else if (ratio < 0.8) band = "PARTIAL_CLAIMS_DROPPED";
  else if (stats.segment_corrected > 0) band = "SHIPPED_WITH_CORRECTIONS";
  else band = "SHIPPED";

  return { band, ratio, stats };
}

export function coverageToRunStatus(
  coverage: Coverage,
): "shipped" | "partial" | "failed" {
  if (coverage.band === "FAILED_UNPROVEN") return "failed";
  if (
    coverage.band === "SHIPPED" ||
    coverage.band === "SHIPPED_WITH_CORRECTIONS"
  ) {
    return "shipped";
  }
  return "partial";
}

/**
 * Schema still fail-closed. Evidence no longer kills the whole run:
 * unproven / injected claims are demoted in place and stay visible.
 */
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

  const notes = structuredClone(parsed.data) as DealNotes;
  const tainted = screenTranscript(transcript);

  for (const item of collectClaims(notes)) {
    notes[item.section][item.index] = gradeClaim(
      item.claim,
      item.path,
      transcript,
      tainted,
    );
  }

  const emailGate = gateEvidenceQuote(
    notes.followUpEmail.evidence.quote,
    notes.followUpEmail.evidence.lineId,
    transcript,
  );
  const emailInjection = screenClaim({
    text: `${notes.followUpEmail.subject}\n${notes.followUpEmail.body}`,
    lineId: notes.followUpEmail.evidence.lineId,
    tainted,
  });
  let emailStatus: ClaimStatus = emailInjection.blocked
    ? "blocked_injection"
    : verdictToStatus(emailGate.verdict);
  if (
    emailGate.verdict === "segment_corrected" &&
    emailGate.matchedLineId &&
    !emailInjection.blocked
  ) {
    notes.followUpEmail.evidence.lineId = emailGate.matchedLineId;
  }

  const allClaims = collectClaims(notes).map((c) => notes[c.section][c.index]!);
  notes.followUpEmail = chokeFollowUp({
    title: notes.title,
    existing: notes.followUpEmail,
    emailStatus,
    claims: allClaims,
    transcript,
  });
  notes.coverage = gradeCoverage([
    ...allClaims,
    {
      id: "followUpEmail",
      text: notes.followUpEmail.subject,
      evidence: notes.followUpEmail.evidence,
      status: notes.followUpEmail.status,
    },
  ]);

  return { ok: true, notes };
}
