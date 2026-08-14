/**
 * What a note is allowed to say, as a test any layer can run.
 *
 * A note has to be a statement about THIS call, in this call's words. The
 * keyword extractor's category lines ("Pricing, seats, or renewal came up on
 * the call.") read as findings while carrying nothing: cover the citation and
 * the reader knows exactly what the section header already told them. Those
 * lines never lead the page, and they never become a bullet in an email.
 *
 * This lives on its own so the renderer and the email choke point can share
 * one definition rather than drift into two.
 */

/** The exact lines the keyword extractor emits when it has nothing to say. */
const TEMPLATE_NOTE_TEXT = new Set(
  [
    "A need or evaluation driver came up on the call.",
    "Pricing, seats, or renewal came up on the call.",
    "A pilot, timeline, or process step was discussed.",
    "A trust, proof, or security requirement was raised.",
    "Pricing or commercial terms were raised.",
    "A vendor decision was referenced on the call.",
    "A follow-up artifact or meeting was mentioned.",
    "A date or checkpoint was mentioned.",
    "A trust, proof, or security concern came up.",
    "Pricing, seats, or renewal cost was mentioned.",
    "An incumbent or competing tool was named on the call.",
  ].map((s) => s.toLowerCase()),
);

const CATEGORY_VERB =
  /\b(came up|comes up|come up|was (mentioned|discussed|raised|referenced|named|noted)|were (mentioned|discussed|raised|referenced|named)|got (mentioned|raised|discussed))\b/i;

/** One honest sentence about what the call never got to. */
const ABSENCE_TEXT = /\bwas not stated on this call\b/i;

/**
 * Does this sentence carry anything the section header did not already say? A
 * number, a name, or a quoted phrase counts. This is the spec's own test,
 * mechanized: cover the citation, and see whether the note still tells you
 * something you did not know.
 */
function hasPayload(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/["“”']/.test(text)) return true;
  const afterFirstWord = text.trim().split(/\s+/).slice(1).join(" ");
  return /\b[A-Z][A-Za-z]{2,}\b/.test(afterFirstWord);
}

/** True when the note names a category instead of stating a finding. */
export function isCategoryNote(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (TEMPLATE_NOTE_TEXT.has(trimmed.toLowerCase())) return true;
  if (!CATEGORY_VERB.test(trimmed)) return false;
  return !hasPayload(trimmed);
}

export function isAbsenceNote(text: string): boolean {
  return ABSENCE_TEXT.test(text);
}
