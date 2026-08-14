/**
 * Display labels: the one place a status becomes words a stranger can read.
 *
 * The enums themselves (`verified`, `segment_corrected`, `uncorroborated`,
 * `blocked_injection`, the coverage bands, the run statuses) are code
 * contracts with tests behind them. Nothing in this file renames them, and
 * nothing in this file is allowed to change behavior. Enum in, English out.
 *
 * Two rules the copy follows:
 * 1. A count is always a fraction ("10 of 11 backed"), never a bare percentage.
 * 2. No term appears on screen that the page has not already explained.
 */
import type { ClaimStatus, Coverage, CoverageBand, RunStatus } from "@/lib/types";

/** What each note status is called on screen. */
export const NOTE_STATUS_LABEL: Record<ClaimStatus, string> = {
  verified: "backed",
  segment_corrected: "backed, citation corrected",
  uncorroborated: "not found in the call",
  blocked_injection: "blocked",
};

const LINK_PATTERNS = new Set(["smuggled_link", "url", "add_link"]);

/**
 * Why a note was blocked, as a sentence instead of a pattern name. The raw
 * reason codes stay in the JSON and the API; only the wording changes here.
 */
export function blockedReasonLine(reasons?: string[]): string {
  const smuggledLink = (reasons ?? []).some((r) => LINK_PATTERNS.has(r));
  if (smuggledLink) {
    return "This line tried to slip a link into the notes. It stays visible here and never enters notes or email.";
  }
  return "This line tried to give instructions to the AI. It stays visible here and never enters notes or email.";
}

/** What the coverage band means, spelled out. */
export const COVERAGE_BAND_LABEL: Record<CoverageBand, string> = {
  SHIPPED: "every note found its line",
  SHIPPED_WITH_CORRECTIONS: "every note found its line, some citations corrected",
  PARTIAL_CLAIMS_DROPPED: "some notes were not found in the call",
  PARTIAL_LOW_COVERAGE: "most notes were not found in the call",
  FAILED_UNPROVEN: "too little of this call could be backed",
};

/** What the run status means, spelled out. */
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: "still working",
  shipped: "notes ready",
  partial: "notes ready, with gaps",
  failed: "not enough backing to ship",
};

/**
 * Why a pass over the call ended the way it did. The reason codes are written
 * by the loop and stored in the run record; only the wording changes here.
 */
const ATTEMPT_REASON_LABEL: Record<string, string> = {
  sample_curated_notes: "notes that ship with this sample",
  demo_extract: "notes read straight off the transcript, no model",
  demo_after_recap_map_retry: "notes read off the transcript after the summarizer came up short",
  pyai_recap: "notes from the PyAI summarizer",
  llm_fallback: "notes from the backup language model",
  gate_blocked: "the answer came back in the wrong shape",
  gate_unproven: "nothing in the answer could be backed by a line in the call",
  extract_error: "the notes step errored out",
  deadline_exceeded: "the time budget ran out",
};

export function attemptReasonLine(reason?: string): string {
  if (!reason) return "no reason recorded";
  const corrected = reason.endsWith("+corrections");
  const base = corrected ? reason.slice(0, -"+corrections".length) : reason;
  const label = ATTEMPT_REASON_LABEL[base] ?? base;
  return corrected ? `${label}, some citations corrected` : label;
}

/**
 * "10 of 11 backed". Blocked notes are not in this fraction: they were never
 * candidates to ship, so counting them would flatter or punish the score for
 * no reason.
 */
export function backedFraction(coverage: Coverage): string {
  return `${coverage.stats.corroborated} of ${coverage.stats.attempted} backed`;
}
