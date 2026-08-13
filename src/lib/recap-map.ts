import type { RecapCall } from "@/lib/pyai";
import { Claim, DealNotes, Evidence, TranscriptLine } from "@/lib/types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestEvidence(
  text: string,
  transcript: TranscriptLine[],
): Evidence {
  if (!transcript.length) {
    return { lineId: "L1", quote: text.slice(0, 80) };
  }

  const needle = normalize(text);
  let best = transcript[0];
  let bestScore = -1;

  for (const line of transcript) {
    const hay = normalize(line.text);
    if (!hay) continue;
    if (hay.includes(needle) || needle.includes(hay)) {
      return {
        lineId: line.id,
        quote: line.text.length > 100 ? `${line.text.slice(0, 97)}...` : line.text,
      };
    }

    const words = needle.split(" ").filter((w) => w.length > 3);
    const hits = words.filter((w) => hay.includes(w)).length;
    const score = words.length ? hits / words.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }

  return {
    lineId: best.id,
    quote: best.text.length > 100 ? `${best.text.slice(0, 97)}...` : best.text,
  };
}

function asStringList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/\n+|(?<=\.)\s+/)
      .map((s) => s.replace(/^[-*•]\s*/, "").trim())
      .filter((s) => s.length > 8);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          return String(
            obj.task ||
              obj.text ||
              obj.item ||
              obj.description ||
              obj.signal ||
              obj.moment ||
              "",
          ).trim();
        }
        return "";
      })
      .filter((s) => s.length > 0);
  }
  return [];
}

function claim(text: string, transcript: TranscriptLine[]): Claim {
  return { text, evidence: bestEvidence(text, transcript) };
}

function pickStrings(
  record: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const list = asStringList(record[key]);
    if (list.length) return list;
  }
  return [];
}

/** Map PyAI Recap artifacts into OpenGong DealNotes with transcript receipts. */
export function mapRecapToDealNotes(
  recap: RecapCall,
  transcript: TranscriptLine[],
  titleHint?: string,
): DealNotes {
  const record = (recap.record || {}) as Record<string, unknown>;
  const title =
    recap.headline ||
    (typeof record.tldr === "string" ? record.tldr : null) ||
    titleHint ||
    "Deal notes";

  const summaryBits = [
    ...asStringList(record.summary),
    ...asStringList(record.summary_draft),
    ...asStringList(record.tldr),
    ...asStringList(record.decisions),
    ...asStringList(record.important_moments),
  ].filter(Boolean);

  const uniqueSummary = [...new Set(summaryBits)].slice(0, 4);
  if (!uniqueSummary.length && typeof record.summary === "string") {
    uniqueSummary.push(record.summary);
  }
  if (!uniqueSummary.length && recap.headline) {
    uniqueSummary.push(recap.headline);
  }
  if (!uniqueSummary.length) {
    uniqueSummary.push("Call completed; detailed summary unavailable from Recap.");
  }

  const objections = pickStrings(record, [
    "objections",
    "risks",
    "blockers",
    "concerns",
  ]);
  const intent = pickStrings(record, [
    "intent",
    "intents",
    "outcomes",
    "signals",
    "call_signals",
  ]);
  const nextSteps = pickStrings(record, [
    "next_steps",
    "action_items",
    "actions",
    "follow_ups",
  ]);

  const fallbackLine = transcript[transcript.length - 1] || transcript[0];
  const next =
    nextSteps.length > 0
      ? nextSteps
      : [
          fallbackLine
            ? `Follow up on: ${fallbackLine.text.slice(0, 120)}`
            : "Send follow-up summarizing agreed next steps.",
        ];

  const intentClaims =
    intent.length > 0
      ? intent.slice(0, 3).map((t) => claim(t, transcript))
      : [
          claim(
            recap.headline ||
              "Buyer left an actionable signal; confirm commitment in follow-up.",
            transcript,
          ),
        ];

  const actionLine = next[0];
  const emailEvidence = bestEvidence(actionLine, transcript);

  return {
    title: String(title).slice(0, 160),
    summary: uniqueSummary.map((t) => claim(t, transcript)),
    objections: objections.slice(0, 4).map((t) => claim(t, transcript)),
    intent: intentClaims,
    nextSteps: next.slice(0, 4).map((t) => claim(t, transcript)),
    followUpEmail: {
      subject: `Follow-up: ${String(title).slice(0, 80)}`,
      body: [
        "Thanks again for the conversation.",
        "",
        typeof record.summary === "string"
          ? record.summary
          : uniqueSummary.join(" "),
        "",
        "Next steps:",
        ...next.slice(0, 4).map((step) => `- ${step}`),
        "",
        "Happy to adjust if I missed anything.",
        "",
        "— OpenGong Lite",
      ].join("\n"),
      evidence: emailEvidence,
    },
  };
}
