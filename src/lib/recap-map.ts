import { gateEvidenceQuote } from "@/lib/harness/gates";
import type { RecapCall } from "@/lib/pyai";
import { Claim, DealNotes, Evidence, TranscriptLine } from "@/lib/types";

/**
 * lineId for a claim no transcript line supports. It never exists in the
 * transcript, so the downstream gate returns missing_line and demotes the
 * claim — and the UI cannot show a real, unrelated line as its receipt.
 */
const UNSUPPORTED_LINE = "__unsupported__";

/**
 * Attach a receipt using the *claim text* as the quote. Never copy a transcript
 * line into evidence.quote — that made the gate self-pass. If the claim is not
 * in the call, the quote still fails the gate and the claim is demoted.
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

function absent(label: string, transcript: TranscriptLine[]): Claim[] {
  return [
    claim(`${label} was not stated on this call.`, transcript),
  ];
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

  const uniqueSummary = [...new Set(summaryBits)].slice(0, 4);
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

  // Absence honesty: when Recap yields nothing for a section, say so in
  // words. A next step the buyer never agreed to must not be invented from a
  // transcript line (right quote, fabricated commitment); the absence claim
  // carries no receipt either, so the gate demotes it too.
  const summaryClaims = uniqueSummary.length
    ? uniqueSummary.map((t) => claim(t, transcript))
    : absent("A call summary", transcript);
  const intentClaims = intent.length
    ? intent.slice(0, 3).map((t) => claim(t, transcript))
    : absent("Buyer intent", transcript);
  const nextClaims = nextSteps.length
    ? nextSteps.slice(0, 4).map((t) => claim(t, transcript))
    : absent("A next step", transcript);

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
