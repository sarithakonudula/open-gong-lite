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
import type { Depth } from "@/lib/methodology";
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

/**
 * Scorecard vocabulary. `Depth` is the enum the scoring code and its tests
 * use; these are the words for it. A rep reading their own call should not
 * have to learn what "mastery" or "surface" was supposed to mean.
 */
export const DEPTH_LABEL: Record<Depth, string> = {
  mastery: "nailed down",
  developing: "explored",
  surface: "mentioned",
  missing: "never came up",
  not_applicable: "not needed here",
};

/** What a trait scored none-to-full means when the call could not back it. */
export const DEPTH_UNBACKED_LABEL = "no line in the call backs this";

/** "8 of 12 backed", same shape as the notes header. Never a bare percentage. */
export function scorecardBackedFraction(stats: {
  corroborated: number;
  total: number;
}): string {
  return `${stats.corroborated} of ${stats.total} backed`;
}

/**
 * How thoroughly a call of this size is expected to have been run. The bands
 * are set by deal value, so a short first call is not marked down for skipping
 * what it had no reason to reach yet.
 */
export const RIGOR_LABEL: Record<string, string> = {
  core: "the basics",
  standard: "a full working call",
  deep: "everything, on the record",
};

export function rigorLine(band: { label: string; rigor: string } | null): string {
  if (!band) return "No deal size given, so the whole method is in scope.";
  const expectation = RIGOR_LABEL[band.rigor] ?? band.rigor;
  return `${band.label} — measured against ${expectation}.`;
}

/**
 * Context the score should be read against. These come back from the model as
 * free-form tags, so the known ones get words and anything new falls back to
 * itself with the underscores taken out.
 */
const CONTEXT_FLAG_LABEL: Record<string, string> = {
  single_threaded: "only one person in the room",
  premature_solutioning: "pitched before asking",
  short_call: "short call",
};

export function contextFlagLabel(flag: string): string {
  return CONTEXT_FLAG_LABEL[flag] ?? flag.replaceAll("_", " ");
}

/**
 * Deal-signal vocabulary. A signal either carries a line from the call or
 * says out loud that it does not; there is no third, quieter state.
 */
export const SIGNAL_EVIDENCE_LABEL: Record<"cited" | "signal_only", string> = {
  cited: "from the call",
  signal_only: "no line in the call backs this one",
};

export const SIGNAL_SEVERITY_LABEL: Record<string, string> = {
  hot: "act today",
  high: "worth a move this week",
  watch: "keep an eye on it",
  info: "context",
};

export const SIGNAL_DIRECTION_LABEL: Record<string, string> = {
  buying_intent: "buying signal",
  risk: "risk",
  stalled: "stalled",
  momentum: "momentum",
};
