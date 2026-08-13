import {
  DealNotes,
  DealNotesSchema,
  GateFailure,
  TranscriptLine,
} from "@/lib/types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteSupportedByLine(quote: string, lineText: string): boolean {
  const q = normalize(quote);
  const line = normalize(lineText);
  if (!q || !line) return false;
  if (line.includes(q) || q.includes(line)) return true;

  const words = q.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const hits = words.filter((w) => line.includes(w)).length;
  return hits / words.length >= 0.6;
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

  const byId = new Map(transcript.map((line) => [line.id, line]));
  const notes = parsed.data;

  const claims = [
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

  for (const { path, claim } of claims) {
    const line = byId.get(claim.evidence.lineId);
    if (!line) {
      failures.push({
        code: "missing_evidence_line",
        message: `Evidence lineId ${claim.evidence.lineId} not in transcript`,
        path,
      });
      continue;
    }
    if (!quoteSupportedByLine(claim.evidence.quote, line.text)) {
      failures.push({
        code: "unproven_claim",
        message: `Quote not found in transcript line ${line.index + 1}`,
        path,
      });
    }
  }

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, notes };
}
