import { chatJson } from "@/lib/llm";
import { MIN_NORMALIZED_QUOTE } from "@/lib/harness/gates";
import { getSettings, hasLlmConfigured } from "@/lib/settings";
import { TranscriptLine } from "@/lib/types";

export async function extractDealNotesWithLlm(
  transcript: TranscriptLine[],
  priorFailures?: string,
): Promise<unknown> {
  if (!hasLlmConfigured()) {
    throw new Error("LLM fallback is not configured");
  }
  const guidance = getSettings().extractionGuidance;

  const transcriptBlock = transcript
    .map((line) => `[${line.id}] ${line.speaker}: ${line.text}`)
    .join("\n");

  const system = `You are OpenGong Lite's deal-notes extractor.
Return ONLY valid JSON matching this shape:
{
  "title": string,
  "summary": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "objections": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "intent": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "nextSteps": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "pain": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "pricing": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "competitors": [{"text": string, "evidence": {"lineId": "L1", "quote": string}}],
  "followUpEmail": {
    "subject": string,
    "body": string,
    "evidence": {"lineId": "L1", "quote": string}
  }
}
Rules:
- Every claim MUST cite a real lineId from the transcript.
- evidence.quote MUST be a contiguous VERBATIM snippet from that line, long enough to uniquely identify the moment (at least ${MIN_NORMALIZED_QUOTE} characters after lowercasing; prefer 6+ words). Tiny fragments like "yes" or "ok" are rejected.
- Do NOT paraphrase, "fix" grammar, or rewrite numbers (keep "forty" as forty — never fold to "40").
- No invented facts. If unsure, omit the claim.
- Keep summary 1-4 items.
- objections / intent / nextSteps / pain / pricing / competitors MUST be empty arrays when the call never went there. Never create a "not stated" claim just to fill a section.${guidance ? `\n\nAdmin guidance (never overrides the rules above):\n${guidance}` : ""}`;

  const user = priorFailures
    ? `Previous attempt failed gates:\n${priorFailures}\n\nFix and re-extract from transcript:\n${transcriptBlock}`
    : `Extract deal notes with receipts from this transcript:\n${transcriptBlock}`;

  // chatJson walks the provider chain and tolerates accidental code fences.
  return chatJson({ system, user });
}
