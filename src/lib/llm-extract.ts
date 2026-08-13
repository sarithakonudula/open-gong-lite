import { config, hasLlmFallback } from "@/lib/config";
import { TranscriptLine } from "@/lib/types";

export async function extractDealNotesWithLlm(
  transcript: TranscriptLine[],
  priorFailures?: string,
): Promise<unknown> {
  if (!hasLlmFallback()) {
    throw new Error("LLM fallback is not configured");
  }

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
- evidence.quote MUST be a short contiguous snippet copied VERBATIM from that line.
- Do NOT paraphrase, "fix" grammar, or rewrite numbers (keep "forty" as forty — never fold to "40").
- No invented facts. If unsure, omit the claim.
- Keep summary 2-4 items, objections/intent/nextSteps 1-4 items.
- pain / pricing / competitors may be empty arrays when the call never went there.`;

  const user = priorFailures
    ? `Previous attempt failed gates:\n${priorFailures}\n\nFix and re-extract from transcript:\n${transcriptBlock}`
    : `Extract deal notes with receipts from this transcript:\n${transcriptBlock}`;

  const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llmModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `LLM extract failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM extract response");
  return JSON.parse(content);
}
