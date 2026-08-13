import { DealNotes, RunRecord, TranscriptLine } from "@/lib/types";

function claimMd(
  claim: { text: string; evidence: { lineId: string; quote: string } },
  transcript: TranscriptLine[],
): string {
  const line = transcript.find((l) => l.id === claim.evidence.lineId);
  const loc = line ? `line ${line.index + 1} · ${line.speaker}` : claim.evidence.lineId;
  return `- ${claim.text}\n  - Receipt (${loc}): “${claim.evidence.quote}”`;
}

export function notesToMarkdown(run: RunRecord): string {
  const notes = run.notes;
  if (!notes) return `# ${run.sourceLabel}\n\n_No notes shipped._\n`;

  const sections: string[] = [
    `# ${notes.title}`,
    "",
    `Status: **${run.status}** · Source: ${run.sourceLabel}`,
    "",
    "## Summary",
    ...notes.summary.map((c) => claimMd(c, run.transcript)),
    "",
    "## Objections",
    ...(notes.objections.length
      ? notes.objections.map((c) => claimMd(c, run.transcript))
      : ["_None captured._"]),
    "",
    "## Intent",
    ...notes.intent.map((c) => claimMd(c, run.transcript)),
    "",
    "## Next steps",
    ...notes.nextSteps.map((c) => claimMd(c, run.transcript)),
    "",
    "## Follow-up email",
    `**Subject:** ${notes.followUpEmail.subject}`,
    "",
    notes.followUpEmail.body,
    "",
    "---",
    "",
    "## Transcript",
    ...run.transcript.map(
      (line) => `**[${line.id}] ${line.speaker}:** ${line.text}`,
    ),
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
