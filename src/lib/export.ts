import { isSentinelEvidence } from "@/lib/analysis-view";
import {
  backedFraction,
  callTimeLabel,
  callTitle,
  COVERAGE_BAND_LABEL,
  NOTE_STATUS_LABEL,
  RUN_STATUS_LABEL,
  speakerDisplayName,
} from "@/lib/labels";
import { ClaimStatus, DealNotes, RunRecord, TranscriptLine } from "@/lib/types";

function claimMd(
  claim: {
    text: string;
    status?: ClaimStatus;
    evidence: { lineId: string; quote: string };
  },
  transcript: TranscriptLine[],
): string {
  const badge = claim.status ? ` [${NOTE_STATUS_LABEL[claim.status]}]` : "";
  const line = transcript.find((l) => l.id === claim.evidence.lineId);
  // The same display contract the screen follows: a note the call could not
  // back carries no source row, because the absence is the information and a
  // quote nobody said is not a citation.
  if (
    !line ||
    claim.status === "uncorroborated" ||
    isSentinelEvidence(claim.evidence)
  ) {
    return `- ${claim.text}${badge}`;
  }
  const who = speakerDisplayName(line.speaker);
  const loc =
    [callTimeLabel(line.startMs), who].filter(Boolean).join(" · ") ||
    `line ${line.index + 1}`;
  return `- ${claim.text}${badge}\n  - Source (${loc}): “${claim.evidence.quote}”`;
}

export function notesToMarkdown(run: RunRecord): string {
  const notes = run.notes;
  if (!notes) return `# ${run.sourceLabel}\n\n_No notes came out of this call._\n`;

  const sections: string[] = [
    `# ${callTitle(notes.title, run.sourceLabel)}`,
    "",
    `**${RUN_STATUS_LABEL[run.status]}** · From: ${run.sourceLabel}`,
    notes.coverage
      ? `**${backedFraction(notes.coverage)}** (${COVERAGE_BAND_LABEL[notes.coverage.band]})`
      : "",
    "",
    "## Summary",
    ...notes.summary.map((c) => claimMd(c, run.transcript)),
    "",
    "## Objections",
    ...(notes.objections.length
      ? notes.objections.map((c) => claimMd(c, run.transcript))
      : ["_Nothing on this in the call._"]),
    "",
    "## Intent",
    ...notes.intent.map((c) => claimMd(c, run.transcript)),
    "",
    "## Next steps",
    ...notes.nextSteps.map((c) => claimMd(c, run.transcript)),
    "",
    ...((notes.pain || []).length
      ? ["## Pain", ...notes.pain.map((c) => claimMd(c, run.transcript)), ""]
      : []),
    ...((notes.pricing || []).length
      ? [
          "## Pricing",
          ...notes.pricing.map((c) => claimMd(c, run.transcript)),
          "",
        ]
      : []),
    ...((notes.competitors || []).length
      ? [
          "## Competitors",
          ...notes.competitors.map((c) => claimMd(c, run.transcript)),
          "",
        ]
      : []),
    "## Follow-up email",
    `**Subject:** ${notes.followUpEmail.subject}`,
    "",
    notes.followUpEmail.body,
    "",
    "---",
    "",
    "## Transcript",
    ...run.transcript.map((line) => {
      const head = [
        callTimeLabel(line.startMs),
        speakerDisplayName(line.speaker),
      ]
        .filter(Boolean)
        .join(" · ");
      return head ? `**${head}:** ${line.text}` : line.text;
    }),
    "",
    "_Runs on PyAI · OpenGong Lite_",
  ];

  return sections.join("\n");
}

export function notesToJson(run: RunRecord): {
  id: string;
  status: string;
  sourceLabel: string;
  notes: DealNotes | null;
  transcript: TranscriptLine[];
  attempts: RunRecord["attempts"];
} {
  return {
    id: run.id,
    status: run.status,
    sourceLabel: run.sourceLabel,
    notes: run.notes,
    transcript: run.transcript,
    attempts: run.attempts,
  };
}
