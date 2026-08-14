/**
 * Quote-fidelity repair: what the retry asks for, and what it refuses to take.
 *
 * The live run that produced this file failed in a specific way. The first
 * pass wrote a correct summary of the call. Its quote was not recoverable
 * word for word from messy speech-to-text, so the gate demoted it. The retry
 * then asked the model to "fix and re-extract", and the model answered three
 * times with the literal string "(no supporting line found in this call)" in
 * evidence.quote. The pipeline read that as a fresh answer, kept failing, and
 * eventually shipped keyword templates whose quotes trivially exist.
 *
 * Two rules come out of that, and this file owns both:
 *
 * 1. The retry has to say what to DO: copy one sentence out of the transcript
 *    character for character. "Fix and re-extract" is not an instruction.
 * 2. A repair that answers with placeholder text instead of a copied sentence
 *    is not a repair. It is discarded, and the demoted original stays. A worse
 *    answer must never replace a better one just because it arrived later.
 */

/**
 * Strings a model reaches for when it has nothing to copy. The first entry is
 * the harness's own sentinel wording, which used to be fed back into the
 * retry as an example of what a quote looks like.
 */
const PLACEHOLDER_QUOTES: RegExp[] = [
  /no supporting line found/i,
  /\bno (?:such |matching |direct )?(?:quote|line|evidence)\b(?:[^.]{0,40})?(?:found|available|present|in the (?:call|transcript))/i,
  /^_{0,3}unsupported_{0,3}$/i,
  /^\s*(?:n\/a|none|null|undefined|tbd|unknown|not applicable)\s*$/i,
  /^\s*\[[^\]]*\]\s*$/,
  /\bplaceholder\b/i,
  /\bquote (?:unavailable|not (?:found|available))\b/i,
  /\bcould not (?:find|locate) (?:a |the )?(?:quote|line)\b/i,
  /\bparaphrase[d]?\b/i,
];

/** Line ids the harness uses to mean "no line", which a model may echo back. */
const SENTINEL_LINE_IDS = new Set(["__unsupported__", "unsupported", "none", "n/a"]);

export function isSentinelLineId(lineId: unknown): boolean {
  if (typeof lineId !== "string") return false;
  return SENTINEL_LINE_IDS.has(lineId.trim().toLowerCase());
}

/**
 * True when this quote is the model describing its failure rather than
 * copying the call. Parentheses around the whole string are a strong tell on
 * their own: a copied sentence out of a transcript is not wrapped in them.
 */
export function isPlaceholderQuote(quote: unknown): boolean {
  if (typeof quote !== "string") return true;
  const trimmed = quote.trim();
  if (!trimmed) return true;
  const inner = trimmed.replace(/^[("']+|[)"']+$/g, "").trim();
  if (!inner) return true;
  const wrapped = /^\(.*\)$/.test(trimmed);
  if (wrapped && /\b(no|not|none|found|available|unsupported)\b/i.test(inner)) {
    return true;
  }
  return PLACEHOLDER_QUOTES.some((p) => p.test(inner));
}

type LooseEvidence = { lineId?: unknown; quote?: unknown };

function collectEvidence(value: unknown, out: LooseEvidence[], depth = 0): void {
  if (depth > 6 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectEvidence(item, out, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  const evidence = record.evidence;
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    out.push(evidence as LooseEvidence);
  }
  for (const child of Object.values(record)) {
    collectEvidence(child, out, depth + 1);
  }
}

/**
 * Does this candidate carry placeholder text where a copied sentence belongs?
 * One placeholder is enough: the instruction was to drop the note it could not
 * quote, so a placeholder means the instruction was not followed.
 */
export function hasPlaceholderEvidence(raw: unknown): boolean {
  const found: LooseEvidence[] = [];
  collectEvidence(raw, found);
  if (!found.length) return false;
  return found.some(
    (e) => isPlaceholderQuote(e.quote) || isSentinelLineId(e.lineId),
  );
}

/**
 * The loop's discard rule, in one place so it can be tested as itself.
 *
 * A repair only replaces what it repairs when it did the thing it was asked to
 * do. Answering with a stand-in is not a repair, so the answer is dropped and
 * the demoted original stays on the page. A first pass is never discarded:
 * there is nothing better to fall back to, and its notes still render marked.
 */
export function shouldDiscardRepair(opts: {
  attempt: number;
  holdingNotes: boolean;
  raw: unknown;
}): boolean {
  if (opts.attempt <= 1 || !opts.holdingNotes) return false;
  return hasPlaceholderEvidence(opts.raw);
}

/**
 * Strip the harness's internal wording out of the failure list before it goes
 * back to a model. Feeding the sentinel quote into the retry taught the model
 * that "(no supporting line found in this call)" was an acceptable answer.
 */
export function sanitizeFailuresForPrompt(failures: string): string {
  return failures
    .split("\n")
    .map((line) =>
      line
        .replace(/__unsupported__/g, "a line that is not in this call")
        .replace(/\(no supporting line found[^)]*\)/gi, "no quote at all"),
    )
    .join("\n")
    .slice(0, 4_000);
}

/**
 * The repair instruction. It names the one action that fixes a demoted note,
 * and it closes the exit the model kept taking.
 */
export function repairInstructions(): string {
  return [
    "The notes below were sent back because their quotes could not be found in the call.",
    "",
    "How to fix one:",
    "1. Find the line in the transcript that the note is actually about.",
    "2. Copy one sentence from that line character for character into evidence.quote, including its wording, its numbers, and its mistakes. Speech-to-text output is often ungrammatical. Copy it anyway.",
    "3. Put that line's id in evidence.lineId.",
    "",
    "Hard rules for this retry:",
    "- evidence.quote must be text that appears in the transcript above, copied, not written.",
    "- Never write a description of a missing quote. Text such as \"(no supporting line found in this call)\", \"N/A\", \"none\", or any bracketed stand-in is rejected, and the whole retry is thrown away with it.",
    "- If you cannot copy a line for a note, drop that note and keep the others. A shorter answer that quotes the call beats a complete one that does not.",
    "- Keep the wording of the notes you already wrote. Only their quotes are in question.",
  ].join("\n");
}

/** The full retry message: what failed, how to fix it, then the transcript. */
export function repairPrompt(
  priorFailures: string,
  transcriptBlock: string,
): string {
  return [
    repairInstructions(),
    "",
    "Sent back:",
    sanitizeFailuresForPrompt(priorFailures),
    "",
    "Transcript:",
    transcriptBlock,
  ].join("\n");
}
