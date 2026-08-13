/**
 * Prompt-injection taint screen.
 *
 * Independent of the receipts gate: a planted line IS in the transcript, so
 * quote-anchoring can never catch it. Patterns require an instruction shape
 * aimed at the model, not a topic ("our pricing page" stays clean).
 *
 * Best-effort by design. The load-bearing defense is the email choke:
 * follow-ups are drafted only from verified / segment_corrected claims.
 */

export type InjectionHit = {
  name: string;
  utteranceId: string;
};

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: "ignore_previous_instructions",
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.!?]{0,40}?\b(previous|prior|above|earlier|all|any|these|those|your|the)\b[^.!?]{0,40}?\b(instructions?|prompts?|rules?|directions?|guidelines?|context)\b/i,
  },
  {
    name: "system_prompt_mention",
    re: /\b(system|developer|assistant)\s+(prompt|message|instructions?)\b[^.!?]{0,20}?\b(say|says|said|state|states|instruct|instructs|require|requires|demand|demands|tell|tells|you (?:must|should|need to|have to))\b/i,
  },
  {
    name: "rate_n_out_of_n",
    re: /\b(rate|score|grade|mark|give)\b[^.!?]{0,20}?\b(this|it|the call|the note|this call|your notes?)\b[^.!?]{0,20}?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out of|\/)\s*(\d+|five|ten|100)\b/i,
  },
  {
    name: "add_link",
    re: /\b(add|include|insert|append|put|embed|place)\b[^.!?]{0,40}?\b(links?|urls?|hyperlinks?)\b[^.!?]{0,40}?(?:https?:\/\/|www\.)/i,
  },
  {
    name: "url",
    re: /https?:\/\/[^\s]{1,2048}/i,
  },
];

export function screenText(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(text)) hits.push(pattern.name);
  }
  return hits;
}

export function screenTranscript(
  transcript: Array<{ id: string; text: string }>,
): Map<string, string[]> {
  const tainted = new Map<string, string[]>();
  for (const line of transcript) {
    const hits = screenText(line.text);
    if (hits.length) tainted.set(line.id, hits);
  }
  return tainted;
}

export function screenClaim(opts: {
  text: string;
  lineId: string;
  tainted: Map<string, string[]>;
}): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const fromLine = opts.tainted.get(opts.lineId);
  if (fromLine?.length) {
    reasons.push("cites_tainted_utterance", ...fromLine);
  }
  for (const name of screenText(opts.text)) {
    if (name === "url" || name === "add_link") {
      reasons.push("smuggled_link", name);
    } else {
      reasons.push("imperative_smuggling", name);
    }
  }
  return { blocked: reasons.length > 0, reasons: [...new Set(reasons)] };
}
