import type { RecapCall } from "@/lib/pyai";
import { Claim, DealNotes, Evidence, TranscriptLine } from "@/lib/types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evidence sentinel for Recap text no transcript line actually supports.
 * The lineId never exists, so the downstream gate demotes the claim to
 * uncorroborated — a Recap sentence must EARN its receipt, never be handed
 * one. (Previously this function returned the best-scoring line's own text
 * as the quote, which the gate then trivially exact-matched: self-certified
 * evidence, the exact laundering the receipts story forbids.)
 */
const NO_EVIDENCE: Evidence = { lineId: "__unsupported__", quote: "" };

function bestEvidence(
  text: string,
  transcript: TranscriptLine[],
): Evidence {
  if (!transcript.length) return NO_EVIDENCE;

  const needle = normalize(text);
  if (!needle) return NO_EVIDENCE;

  for (const line of transcript) {
    const hay = normalize(line.text);
    if (!hay) continue;
    if (hay.includes(needle) || needle.includes(hay)) {
      return {
        lineId: line.id,
        quote: line.text.length > 100 ? `${line.text.slice(0, 97)}...` : line.text,
      };
    }
  }

  return NO_EVIDENCE;
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
  const pain = pickStrings(record, ["pain", "pains", "pain_points", "impact"]);
  const pricing = pickStrings(record, [
    "pricing",
    "budget",
    "commercials",
    "discount",
  ]);
  const competitors = pickStrings(record, [
    "competitors",
    "competition",
    "incumbent",
    "alternatives",
  ]);

  // Absence honesty: when Recap yields no next steps, the section stays
  // empty — a next step the buyer never agreed to must not be invented from
  // a transcript line (right quote, fabricated commitment).
  const next = nextSteps;

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
  const emailEvidence = actionLine ? bestEvidence(actionLine, transcript) : NO_EVIDENCE;

  return {
    title: String(title).slice(0, 160),
    summary: uniqueSummary.map((t) => claim(t, transcript)),
    objections: objections.slice(0, 4).map((t) => claim(t, transcript)),
    intent: intentClaims,
    nextSteps: next.slice(0, 4).map((t) => claim(t, transcript)),
    pain: pain.slice(0, 4).map((t) => claim(t, transcript)),
    pricing: pricing.slice(0, 4).map((t) => claim(t, transcript)),
    competitors: competitors.slice(0, 4).map((t) => claim(t, transcript)),
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
