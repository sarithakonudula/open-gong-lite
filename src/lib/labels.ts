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
  repair_placeholder_discarded:
    "a repair came back with a stand-in where a line from the call belongs, so it was thrown away and the earlier notes kept",
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
 * Routed follow-up vocabulary. The routed panel names the template that fired,
 * the model that wrote the draft, and what the screen took out of it. Same two
 * rules as the rest of this file: counts stay whole numbers, and no enum
 * reaches the screen.
 */
export function routedPanelTitle(short: string): string {
  return `Routed follow-up: ${short} template`;
}

const MODEL_SOURCE_LABEL: Record<string, string> = {
  configured: "the model this deployment is configured with",
  "ollama-local": "a model running on this machine",
  deterministic: "the template filled from backed notes only (no model)",
};

export function modelSourceLabel(source: string): string {
  return MODEL_SOURCE_LABEL[source] ?? source.replaceAll("_", " ");
}

/** "2 lines cut" or "0 lines cut". A count, never a share of anything. */
export function linesCutLine(cut: number, offTemplateCut = 0): string {
  const base = `${cut} line${cut === 1 ? "" : "s"} cut`;
  if (offTemplateCut <= 0) return base;
  return `${base}, ${offTemplateCut} of them off this template`;
}

/**
 * Analysis-screen vocabulary.
 *
 * Everything below is what the notes page is allowed to say out loud. The
 * screen is for a rep between calls, so the page reads as the call's own
 * title and findings, and the machinery that produced it stays in one
 * collapsed drawer at the end.
 */

/** Engineering state the extractor used to staple onto the call's title. */
const TITLE_MACHINERY = /\s*\((?:[^()]*\b(?:extractor|deterministic|fallback|keyword|model|pipeline)\b[^()]*)\)\s*$/i;

/** The page's heading is the call, never the pipeline that read it. */
export function callTitle(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? "").replace(TITLE_MACHINERY, "").trim();
  return cleaned || fallback;
}

/** A speaker label that is only a machine's numbering, not an identity. */
const MACHINE_SPEAKER = /^(?:speaker|spk|channel|ch)[\s_-]*\d+$/i;

export function isMachineSpeakerLabel(raw: string | undefined): boolean {
  return MACHINE_SPEAKER.test((raw ?? "").trim());
}

/**
 * The name to show for a speaker, or null when there is no name to show.
 * A single-stream recording gives the diarizer nothing to separate, so the
 * numbers it invents ("Speaker 3") are not people and never appear as people.
 */
export function speakerDisplayName(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || isMachineSpeakerLabel(trimmed)) return null;
  return trimmed;
}

/** "0:41", "12:05", "1:02:33". The reader's address for a moment in the call. */
export function callTimeLabel(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** What a citation button says when the call carries no clock for that line. */
export const SOURCE_WITHOUT_TIME = "See it in the call";

export function sourceLine(timeLabel: string | null): string {
  return timeLabel ? `Hear it at ${timeLabel}` : SOURCE_WITHOUT_TIME;
}

/** The chip strip under the title: what the call touched on, each with a line. */
export const TOPICS_HEADING = "Topics detected";

/** Section headers, as labels rather than display type. */
export const SECTION_TITLE: Record<string, string> = {
  summary: "Summary",
  nextSteps: "Next steps",
  objections: "Objections",
  intent: "Intent",
  pain: "Pain",
  pricing: "Pricing",
  competitors: "Competitors",
};

/** What a section says when the call never went there. */
export function nothingInCallLine(title: string): string {
  return `${title} did not come up on this call.`;
}

/**
 * What the page says when the call produced no finding worth printing. One
 * honest line beats seven copies of "Nothing on this in the call."
 */
export const NO_NOTES_LINE =
  "Nothing in this call could be written up as a finding that points back to a line. The topics it touched on are above, each one with the moment it came from.";

/** The one explainer for a group of notes with no line behind them. */
export function couldNotVerifyHeading(count: number): string {
  return `Couldn't verify (${count})`;
}

export const COULD_NOT_VERIFY_EXPLAINER =
  "These lines couldn't be matched to anything said on the call. They stay visible and never enter the follow-up email.";

export function blockedHeading(count: number): string {
  return `Blocked (${count})`;
}

/** Who carries a next step. Derived from the claim's own words, or nobody. */
export const NEXT_STEP_OWNER_LABEL: Record<string, string> = {
  rep: "Your side",
  buyer: "The buyer",
  joint: "Both sides",
  unassigned: "No owner named",
};

export function nextStepOwnerLabel(owner: string | undefined): string {
  return NEXT_STEP_OWNER_LABEL[owner ?? "unassigned"] ?? NEXT_STEP_OWNER_LABEL.unassigned!;
}

/** The email is the one surface a run-level verdict is allowed to close. */
export const EMAIL_HELD_BACK_LINE =
  "No draft went out. Every line in a follow-up has to be backed by a line in the call, and this run did not clear that bar. The notes above still stand as they are.";

/** The drawer at the end of the page, for whoever runs this deployment. */
export const RUN_DETAILS_SUMMARY = "Run details";

export const RUN_DETAILS_INTRO =
  "How this call was read, for whoever runs this deployment.";

export function templateLinesHeldBackLine(count: number): string {
  if (count <= 0) return "";
  return `${count} line${count === 1 ? "" : "s"} of category text held back from the notes and folded into the topics above.`;
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
