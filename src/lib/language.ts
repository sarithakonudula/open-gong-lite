// Deterministic transcript language detection — stopword frequency over the
// languages PyAI can plausibly serve. Used by the admin language filter:
// when the filter is on, a call detected outside the allowed set is refused
// LLM scoring (the transcript itself stays viewable).

import { TranscriptLine } from "@/lib/types";

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "you", "that", "this", "with", "for", "have", "was", "not", "what", "your"],
  es: ["que", "los", "las", "una", "por", "con", "para", "está", "pero", "como", "más", "usted"],
  fr: ["les", "des", "est", "vous", "que", "pour", "dans", "avec", "une", "pas", "nous", "sur"],
  de: ["der", "die", "das", "und", "ist", "nicht", "sie", "mit", "für", "auf", "ein", "wir"],
  pt: ["que", "não", "uma", "para", "com", "você", "mas", "por", "mais", "isso", "está", "como"],
};

export type LanguageGuess = {
  code: string;
  confidence: "high" | "medium" | "low";
};

export function detectLanguage(transcript: TranscriptLine[]): LanguageGuess {
  const counts = new Map<string, number>();
  let totalWords = 0;
  for (const line of transcript) {
    for (const word of line.text.toLowerCase().split(/[^\p{L}]+/u)) {
      if (!word) continue;
      totalWords += 1;
      for (const [code, words] of Object.entries(STOPWORDS)) {
        if (words.includes(word)) {
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }
      }
    }
  }
  if (totalWords === 0) return { code: "en", confidence: "low" };

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top[1] === 0) return { code: "en", confidence: "low" };
  const confidence: LanguageGuess["confidence"] =
    top[1] >= 5 && top[1] >= (second?.[1] ?? 0) * 2
      ? "high"
      : top[1] > (second?.[1] ?? 0)
        ? "medium"
        : "low";
  return { code: top[0], confidence };
}
