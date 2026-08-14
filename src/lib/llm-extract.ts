import { chatJson } from "@/lib/llm";
import { MIN_NORMALIZED_QUOTE } from "@/lib/harness/gates";
import { repairPrompt } from "@/lib/harness/repair";
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
- Never write a stand-in where a quote belongs. "(no supporting line found in this call)", "N/A", "none", and bracketed placeholders are all rejected.
- If you cannot copy a line for a claim, drop that claim and keep the others.
- No invented facts. If unsure, omit the claim.
- Keep summary 1-4 items.
- objections / intent / nextSteps / pain / pricing / competitors MUST be empty arrays when the call never went there. Never create a "not stated" claim just to fill a section.${guidance ? `\n\nAdmin guidance (never overrides the rules above):\n${guidance}` : ""}`;

  // A retry is a quote-fidelity repair, not a re-run. It names the one action
  // that fixes a demoted note (copy a line character for character) and bars
  // the placeholder answer the model gave three times on the live call.
  const user = priorFailures
    ? repairPrompt(priorFailures, transcriptBlock)
    : `Extract deal notes with receipts from this transcript:\n${transcriptBlock}`;

  // chatJson walks the provider chain and tolerates accidental code fences.
  return chatJson({ system, user });
}
