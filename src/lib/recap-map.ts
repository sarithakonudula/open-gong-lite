import { gateEvidenceQuote } from "@/lib/harness/gates";
import type { RecapCall } from "@/lib/pyai";
import { Claim, DealNotes, Evidence, TranscriptLine } from "@/lib/types";

/**
 * lineId for a claim no transcript line supports. It never exists in the
 * transcript, so the downstream gate returns missing_line and demotes the
 * claim — and the UI cannot show a real, unrelated line as its receipt.
 */
const UNSUPPORTED_LINE = "__unsupported__";

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "call",
  "customer",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "its",
  "looking",
  "of",
  "on",
  "or",
  "our",
  "said",
  "she",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "will",
  "with",
  "you",
]);

function stemToken(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.map(stemToken)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)) ?? [],
  );
}

function overlapScore(claim: string, line: string): {
  overlap: number;
  coverage: number;
} {
  const claimTokens = contentTokens(claim);
  const lineTokens = contentTokens(line);
  const overlap = [...claimTokens].filter((token) => lineTokens.has(token)).length;
  return {
    overlap,
    coverage: claimTokens.size ? overlap / claimTokens.size : 0,
  };
}

/** Keep the exact transcript substring while focusing long Hear turns. */
function focusedQuote(line: string, claim: string): string {
  if (line.length <= 240) return line.trim();
  const wanted = contentTokens(claim);
  const lower = line.toLowerCase();
  const positions = [...wanted]
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const center = positions.length
    ? positions[Math.floor(positions.length / 2)]!
    : 0;
  const start = Math.max(0, Math.min(line.length - 240, center - 100));
  return line.slice(start, start + 240).trim();
}

/**
 * Attach a receipt without treating an arbitrary transcript line as proof.
 * Exact claims keep their own quote; strong Recap paraphrases may cite the
 * lexically matching source line. Unsupported claims keep a sentinel line id
 * and are demoted by the downstream gate.
 */
export function locateEvidence(
  text: string,
  transcript: TranscriptLine[],
): Evidence {
  if (!transcript.length) {
    throw new Error("Cannot attach receipts to an empty transcript");
  }
  const quote = text.trim().slice(0, 240) || "unquoted claim";

  for (const line of transcript) {
    const gate = gateEvidenceQuote(quote, line.id, transcript);
    if (
      gate.verdict === "match_exact" ||
      gate.verdict === "match_normalized"
    ) {
      return { lineId: gate.matchedLineId || line.id, quote };
    }
    if (gate.verdict === "segment_corrected" && gate.matchedLineId) {
      return { lineId: gate.matchedLineId, quote };
    }
  }

  // Recap summarizes rather than quoting verbatim. Rescue only strong lexical
  // matches, then cite an exact transcript substring. Requiring at least three
  // content-token matches and 40% claim coverage prevents an unrelated line
  // from laundering a fabricated claim through a valid quote.
  const ranked = transcript
    .map((line) => ({ line, ...overlapScore(text, line.text) }))
    .filter((candidate) => candidate.overlap >= 3 && candidate.coverage >= 0.4)
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        b.overlap - a.overlap ||
        a.line.index - b.line.index,
    );
  const best = ranked[0];
  if (best) {
    return {
      lineId: best.line.id,
      quote: focusedQuote(best.line.text, text),
    };
  }

  return { lineId: UNSUPPORTED_LINE, quote };
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
  return { text, evidence: locateEvidence(text, transcript) };
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
  if (!transcript.length) {
    throw new Error("Cannot map Recap onto an empty transcript");
  }

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

  // Purpose + takeaways: keep enough Recap bullets for a Fathom-style recap.
  const uniqueSummary = [...new Set(summaryBits)].slice(0, 6);
  if (!uniqueSummary.length && typeof record.summary === "string") {
    uniqueSummary.push(record.summary);
  }
  if (!uniqueSummary.length && recap.headline) {
    uniqueSummary.push(recap.headline);
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

  const summaryClaims = uniqueSummary.length
    ? uniqueSummary.map((t) => claim(t, transcript))
    : [];
  const intentClaims = intent.length
    ? intent.slice(0, 3).map((t) => claim(t, transcript))
    : [];
  const nextClaims = nextSteps.length
    ? nextSteps.slice(0, 4).map((t) => claim(t, transcript))
    : [];

  const emailSource = nextSteps[0] || uniqueSummary[0] || title;

  return {
    title: String(title).slice(0, 160),
    summary: summaryClaims,
    objections: objections.slice(0, 4).map((t) => claim(t, transcript)),
    intent: intentClaims,
    nextSteps: nextClaims,
    pain: pain.slice(0, 4).map((t) => claim(t, transcript)),
    pricing: pricing.slice(0, 4).map((t) => claim(t, transcript)),
    competitors: competitors.slice(0, 4).map((t) => claim(t, transcript)),
    followUpEmail: {
      subject: `Follow-up: ${String(title).slice(0, 80)}`,
      body: [
        "Thanks again for the conversation.",
        "",
        uniqueSummary.join(" ") || "Recap did not return a summary we could cite.",
        "",
        "Next steps:",
        ...(nextSteps.length
          ? nextSteps.slice(0, 4).map((step) => `- ${step}`)
          : ["- None stated on the call — not invented here."]),
        "",
        "Happy to adjust if I missed anything.",
        "",
        "— OpenGong Lite",
      ].join("\n"),
      evidence: locateEvidence(String(emailSource), transcript),
    },
  };
}
