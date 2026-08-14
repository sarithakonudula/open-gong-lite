import {
  backedFraction,
  callTimeLabel,
  callTitle,
  COVERAGE_BAND_LABEL,
  NOTE_STATUS_LABEL,
  RUN_STATUS_LABEL,
  speakerDisplayName,
} from "@/lib/labels";
import {
  Claim,
  ClaimStatus,
  DealNotes,
  isEmailableStatus,
  RunRecord,
  TranscriptLine,
} from "@/lib/types";

function claimStatus(claim: Claim): ClaimStatus {
  return claim.status ?? "verified";
}

function backedClaims(claims: Claim[]): Claim[] {
  return claims.filter((claim) => isEmailableStatus(claimStatus(claim)));
}

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
  // A reader gets the moment, not the harness's addressing. A single-stream
  // recording carries no speaker worth naming, so the label drops out here
  // for the same reason it drops out of the screen.
  if (!line) return `- ${claim.text}${badge}`;
  const loc =
    [callTimeLabel(line.startMs), speakerDisplayName(line.speaker)]
      .filter(Boolean)
      .join(" · ") || `line ${line.index + 1}`;
  return `- ${claim.text}${badge}\n  - Source (${loc}): “${claim.evidence.quote}”`;
}

function sectionLines(
  title: string,
  claims: Claim[],
  transcript: TranscriptLine[],
  { omitWhenEmpty = false }: { omitWhenEmpty?: boolean } = {},
): string[] {
  const visible = backedClaims(claims);
  if (!visible.length) {
    if (omitWhenEmpty) return [];
    return [`## ${title}`, "_Nothing on this in the call._", ""];
  }
  return [
    `## ${title}`,
    ...visible.map((c) => claimMd(c, transcript)),
    "",
  ];
}

export function notesToMarkdown(run: RunRecord): string {
  const notes = run.notes;
  if (!notes) return `# ${run.sourceLabel}\n\n_No notes came out of this call._\n`;

  const emailBacked = isEmailableStatus(notes.followUpEmail.status);
  const sections: string[] = [
    `# ${callTitle(notes.title, run.sourceLabel)}`,
    "",
    `**${RUN_STATUS_LABEL[run.status]}** · From: ${run.sourceLabel}`,
    notes.coverage
      ? `**${backedFraction(notes.coverage)}** (${COVERAGE_BAND_LABEL[notes.coverage.band]})`
      : "",
    "",
    ...sectionLines("Summary", notes.summary, run.transcript),
    ...sectionLines("Objections", notes.objections, run.transcript),
    ...sectionLines("Intent", notes.intent, run.transcript),
    ...sectionLines("Next steps", notes.nextSteps, run.transcript),
    ...sectionLines("Pain", notes.pain || [], run.transcript, {
      omitWhenEmpty: true,
    }),
    ...sectionLines("Pricing", notes.pricing || [], run.transcript, {
      omitWhenEmpty: true,
    }),
    ...sectionLines("Competitors", notes.competitors || [], run.transcript, {
      omitWhenEmpty: true,
    }),
    "## Follow-up email",
    ...(emailBacked
      ? [
          `**Subject:** ${notes.followUpEmail.subject}`,
          "",
          notes.followUpEmail.body,
        ]
      : [
          "_No transcript-backed follow-up email is available._",
        ]),
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
