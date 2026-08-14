/**
 * The display contract for the analysis screen.
 *
 * One mapping function stands between what the harness stores and what a
 * reader sees, and it is the only place that decision is made. The rules it
 * enforces all come from one real call that went wrong on the deployment:
 *
 * 1. Sentinels never render. A claim with no real evidence shows its state
 *    and NO source row. The absence of a citation is the information.
 * 2. Internal addressing never renders. Line ids, claim paths, status enums,
 *    try counts, and reason codes are operator information; the reader gets a
 *    timestamp and the sentence.
 * 3. Category text never leads. A note that only names a topic ("Pricing,
 *    seats, or renewal came up on the call.") is not a finding about this
 *    call, so it drops out of the notes and joins the topic chips.
 * 4. A demoted note the model actually wrote outranks a template line that
 *    passed its quote check trivially. Better content with a worse citation
 *    is worth more to a reader than empty content with a perfect one.
 * 5. The run-level verdict gates the email. It never blanks the notes.
 */
import {
  callTimeLabel,
  callTitle,
  isMachineSpeakerLabel,
  nextStepOwnerLabel,
  speakerDisplayName,
} from "@/lib/labels";
import { CONVERSATION_TOPICS, topicEvidence } from "@/lib/deal-signals";
import { normalizeQuote } from "@/lib/harness/gates";
import { isSentinelLineId, isPlaceholderQuote } from "@/lib/harness/repair";
import { isAbsenceNote, isCategoryNote } from "@/lib/note-text";
import { deriveFacets } from "@/lib/template-facets";
import type {
  Claim,
  ClaimStatus,
  Evidence,
  RunRecord,
  TranscriptLine,
} from "@/lib/types";
import { isEmailableStatus } from "@/lib/types";

/** A citation the reader can act on, or nothing at all. */
export type SourceView = {
  lineId: string;
  quote: string;
  timeLabel: string | null;
  speaker: string | null;
};

export type NoteView = {
  key: string;
  text: string;
  status: ClaimStatus;
  /** False when the text only names a category instead of stating a finding. */
  callSpecific: boolean;
  source: SourceView | null;
  /** Raw pattern names, turned into a sentence by the label layer. */
  blockedReasons?: string[];
};

export type NoteSectionView = {
  id: string;
  title: string;
  backed: NoteView[];
  unverified: NoteView[];
  blocked: NoteView[];
  /** Honest absence, said once and quietly, when the call never went there. */
  absenceLine: string | null;
  hasContent: boolean;
};

export type TopicChipView = {
  id: string;
  label: string;
  lineId: string;
  quote: string;
  timeLabel: string | null;
};

export type OwnerStepView = {
  key: string;
  text: string;
  due: string | null;
  status: ClaimStatus;
  source: SourceView | null;
};

export type OwnerGroupView = {
  owner: string;
  ownerLabel: string;
  steps: OwnerStepView[];
};

export type TranscriptLineView = {
  lineId: string;
  text: string;
  speaker: string | null;
  timeLabel: string | null;
  blocked: boolean;
};

export type RunDetailsView = {
  statusLine: string;
  coverageLine: string | null;
  sourceLabel: string;
  attempts: string[];
  heldBackLine: string;
  errorLine: string | null;
};

export type AnalysisView = {
  title: string;
  /** "4 of 5 backed", counted over the notes this page actually shows. */
  fraction: string | null;
  /** True when the call produced no finding worth printing as a note. */
  noNotes: boolean;
  correctedCount: number;
  notFoundCount: number;
  blockedCount: number;
  topics: TopicChipView[];
  sections: NoteSectionView[];
  ownerGroups: OwnerGroupView[];
  email: {
    held: boolean;
    subject: string;
    body: string;
    source: SourceView | null;
  };
  showSpeakers: boolean;
  transcript: TranscriptLineView[];
  suppressedTemplateCount: number;
};

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

/**
 * Is this "evidence" the harness talking to itself? Sentinel line ids and
 * placeholder quotes are gate-internal, and a claim carrying either has no
 * citation at all as far as a reader is concerned.
 */
export function isSentinelEvidence(evidence: Evidence | undefined): boolean {
  if (!evidence) return true;
  if (isSentinelLineId(evidence.lineId)) return true;
  return isPlaceholderQuote(evidence.quote);
}

function sourceFor(
  evidence: Evidence,
  status: ClaimStatus,
  byId: Map<string, TranscriptLine>,
  showSpeakers: boolean,
): SourceView | null {
  // A note with no line behind it gets no source row. Its state already says
  // everything a source row could, and a fake one would say something false.
  if (status === "uncorroborated" || isSentinelEvidence(evidence)) return null;
  const line = byId.get(evidence.lineId);
  if (!line) return null;
  return {
    lineId: line.id,
    quote: evidence.quote,
    timeLabel: callTimeLabel(line.startMs),
    speaker: showSpeakers ? speakerDisplayName(line.speaker) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Note text                                                           */
/* ------------------------------------------------------------------ */

/**
 * Note text rules live in one module the email choke point shares, so the page
 * and the outbound draft can never disagree about what counts as a finding.
 */
export { isAbsenceNote, isCategoryNote } from "@/lib/note-text";

/* ------------------------------------------------------------------ */
/* Ordering                                                            */
/* ------------------------------------------------------------------ */

const STATUS_RANK: Record<ClaimStatus, number> = {
  verified: 0,
  segment_corrected: 1,
  uncorroborated: 2,
  blocked_injection: 3,
};

/**
 * The fallback inversion, as one comparator.
 *
 * A note written about this call comes first even when its citation could not
 * be verified. A template line comes last even when its citation is perfect.
 * The old order was the other way around, which is how a page of "backed"
 * category phrases outranked a correct summary of the call.
 */
export function orderNotesForRender(notes: NoteView[]): NoteView[] {
  return [...notes].sort((a, b) => {
    if (a.callSpecific !== b.callSpecific) return a.callSpecific ? -1 : 1;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  });
}

function dedupe(notes: NoteView[]): NoteView[] {
  const seen = new Set<string>();
  const out: NoteView[] = [];
  for (const note of notes) {
    const key = normalizeQuote(note.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Speakers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Whether this call has speaker identities worth showing.
 *
 * A single-stream recording gives the diarizer one voice track and it guesses.
 * When that guess overshoots, it leaves numbered labels behind ("Speaker 3"),
 * and a number is not a person. One label for the whole call is not an
 * identity either. Both cases drop speaker display for the call rather than
 * print an identity nobody can stand behind.
 */
export function shouldShowSpeakers(transcript: TranscriptLine[]): boolean {
  if (!transcript.length) return false;
  if (transcript.some((line) => isMachineSpeakerLabel(line.speaker))) {
    return false;
  }
  const names = new Set(
    transcript
      .map((line) => speakerDisplayName(line.speaker))
      .filter((name): name is string => Boolean(name)),
  );
  return names.size >= 2;
}

/* ------------------------------------------------------------------ */
/* Next steps by owner                                                 */
/* ------------------------------------------------------------------ */

const DUE_PHRASE =
  /\b(today|tomorrow|tonight|this (?:morning|afternoon|evening|week|month|quarter)|next (?:week|month|quarter|year)|end of (?:day|the day|week|the week|month|the month|quarter)|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|q[1-4])\b/i;

/** The due date in the words it was spoken in, or nothing. */
export function spokenDue(text: string): string | null {
  const match = DUE_PHRASE.exec(text);
  return match ? match[0] : null;
}

export function groupStepsByOwner(
  steps: NoteView[],
): OwnerGroupView[] {
  const groups = new Map<string, OwnerStepView[]>();
  for (const step of steps) {
    const owner = deriveFacets("next_steps", step.text).owner ?? "unassigned";
    const list = groups.get(owner) ?? [];
    list.push({
      key: step.key,
      text: step.text,
      due: spokenDue(step.text),
      status: step.status,
      source: step.source,
    });
    groups.set(owner, list);
  }
  const order = ["rep", "buyer", "joint", "unassigned"];
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([owner, list]) => ({
      owner,
      ownerLabel: nextStepOwnerLabel(owner),
      steps: list,
    }));
}

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

const SECTION_ORDER: Array<{ id: string; title: string }> = [
  { id: "summary", title: "Summary" },
  { id: "nextSteps", title: "Next steps" },
  { id: "objections", title: "Objections" },
  { id: "intent", title: "Intent" },
  { id: "pain", title: "Pain" },
  { id: "pricing", title: "Pricing" },
  { id: "competitors", title: "Competitors" },
];

function claimStatus(claim: Claim): ClaimStatus {
  return claim.status ?? "verified";
}

function toNoteView(
  claim: Claim,
  sectionId: string,
  index: number,
  byId: Map<string, TranscriptLine>,
  showSpeakers: boolean,
): NoteView {
  const status = claimStatus(claim);
  return {
    key: `${sectionId}-${index}`,
    text: claim.text.trim(),
    status,
    callSpecific: !isCategoryNote(claim.text),
    source: sourceFor(claim.evidence, status, byId, showSpeakers),
    ...(claim.blockedReasons?.length
      ? { blockedReasons: claim.blockedReasons }
      : {}),
  };
}

export function topicChips(
  transcript: TranscriptLine[],
  byId: Map<string, TranscriptLine>,
): TopicChipView[] {
  const chips: TopicChipView[] = [];
  for (const topic of CONVERSATION_TOPICS) {
    const evidence = topicEvidence(topic, transcript, 1);
    const first = evidence[0];
    if (!first) continue;
    chips.push({
      id: topic.id,
      label: topic.label,
      lineId: first.lineId,
      quote: first.quote,
      timeLabel: callTimeLabel(byId.get(first.lineId)?.startMs),
    });
  }
  return chips;
}

export function buildAnalysisView(run: RunRecord): AnalysisView {
  const notes = run.notes;
  const byId = new Map(run.transcript.map((line) => [line.id, line]));
  const showSpeakers = shouldShowSpeakers(run.transcript);

  const sections: NoteSectionView[] = [];
  let suppressedTemplateCount = 0;
  let nextStepNotes: NoteView[] = [];

  for (const { id, title } of SECTION_ORDER) {
    const claims = notes
      ? ((notes[id as keyof typeof notes] as Claim[] | undefined) ?? [])
      : [];
    const views = dedupe(
      claims.map((claim, index) =>
        toNoteView(claim, id, index, byId, showSpeakers),
      ),
    );

    // Absence, said once. A section that reports what did not happen keeps
    // one quiet line rather than a struck-through claim about nothing.
    const absence = views.find((note) => isAbsenceNote(note.text));
    const withoutAbsence = views.filter((note) => !isAbsenceNote(note.text));

    // Category text leaves the notes here. It reappears under the title as a
    // topic chip, which is all it ever said.
    const kept = withoutAbsence.filter((note) => note.callSpecific);
    suppressedTemplateCount += withoutAbsence.length - kept.length;

    const ordered = orderNotesForRender(kept);
    const backed = ordered.filter(
      (n) => n.status === "verified" || n.status === "segment_corrected",
    );
    const unverified = ordered.filter((n) => n.status === "uncorroborated");
    const blocked = ordered.filter((n) => n.status === "blocked_injection");

    // Action items are the commitment list, so only steps with a line behind
    // them get one. A step nobody can point to still shows in Next steps,
    // under the group that says it could not be verified.
    if (id === "nextSteps") nextStepNotes = backed;

    sections.push({
      id,
      title,
      backed,
      unverified,
      blocked,
      absenceLine: absence
        ? absence.text
        : ordered.length === 0
          ? "Nothing on this in the call."
          : null,
      hasContent: ordered.length > 0,
    });
  }

  // Lines someone used to speak an instruction to the AI. They stay visible in
  // the transcript, marked, because that is the evidence of the attempt.
  const taintedLines = new Set(
    (notes
      ? [
          ...notes.summary,
          ...notes.objections,
          ...notes.intent,
          ...notes.nextSteps,
          ...(notes.pain ?? []),
          ...(notes.pricing ?? []),
          ...(notes.competitors ?? []),
        ]
      : []
    )
      .filter((claim) => claimStatus(claim) === "blocked_injection")
      .map((claim) => claim.evidence.lineId),
  );

  const email = notes?.followUpEmail;
  // The one surface the run-level verdict closes. Notes above it are unaffected.
  // Legacy runs may omit status; treat missing status as displayable.
  const emailHeld =
    !email ||
    (email.status != null && !isEmailableStatus(email.status)) ||
    run.status === "failed";

  // The score describes the page. Counting lines the page holds back would
  // claim backing for notes nobody can see.
  const shownBacked = sections.reduce((n, s) => n + s.backed.length, 0);
  const shownUnverified = sections.reduce((n, s) => n + s.unverified.length, 0);
  const shownBlocked = sections.reduce((n, s) => n + s.blocked.length, 0);
  const attempted = shownBacked + shownUnverified;
  const corrected = sections
    .flatMap((s) => s.backed)
    .filter((n) => n.status === "segment_corrected").length;

  return {
    title: callTitle(notes?.title, run.sourceLabel),
    fraction: attempted > 0 ? `${shownBacked} of ${attempted} backed` : null,
    noNotes: attempted + shownBlocked === 0,
    correctedCount: corrected,
    notFoundCount: shownUnverified,
    blockedCount: shownBlocked,
    topics: topicChips(run.transcript, byId),
    sections,
    ownerGroups: groupStepsByOwner(nextStepNotes),
    email: {
      held: emailHeld,
      subject: email?.subject ?? "",
      body: email?.body ?? "",
      source: email
        ? sourceFor(
            email.evidence,
            email.status ?? "verified",
            byId,
            showSpeakers,
          )
        : null,
    },
    showSpeakers,
    transcript: run.transcript.map((line) => ({
      lineId: line.id,
      text: line.text,
      speaker: showSpeakers ? speakerDisplayName(line.speaker) : null,
      timeLabel: callTimeLabel(line.startMs),
      blocked: taintedLines.has(line.id),
    })),
    suppressedTemplateCount,
  };
}
