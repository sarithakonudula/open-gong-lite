/**
 * Routing facets: the typed fields the template library routes against.
 *
 * The template files are written against claim SCHEMAS (a section, and the
 * small enums a section carries) rather than against the words of any one
 * deal. This extractor emits prose claims with no enums on them, so the enums
 * have to be derived, and this file is the only place that happens. Two rules
 * keep the derivation honest:
 *
 * 1. A facet is assigned only on an explicit marker in the claim's own words.
 *    An underivable facet is left undefined, an undefined field fails every
 *    `where` clause that asks for it, and the template simply stays silent.
 *    Silence is the safe answer, so the cost of ambiguity always lands on the
 *    template rather than on a reader.
 * 2. Nothing here reads the transcript, and nothing here changes a claim. The
 *    facets ride alongside the claim for the length of one routing decision
 *    and are never stored, never shown, and never sent to a model.
 *
 * A facet is a routing hint. It never becomes a sentence in an email: every
 * asserting line still comes from the claim text the gate already backed.
 */

/** Section names the templates use, mapped from the deal-notes keys. */
export type TemplateSection =
  | "summary"
  | "objections"
  | "intent"
  | "next_steps"
  | "pain"
  | "pricing"
  | "competitors";

export type ClaimFacets = {
  /** next_steps: what kind of step was agreed. */
  type?: "concrete_date" | "send_info" | "soft_followup" | "no_next_step";
  /** next_steps: who carries it. */
  owner?: "rep" | "buyer" | "joint";
  /** objections: was the concern answered on the call. */
  handling?: "addressed" | "deflected" | "unhandled";
  /** objections: where the concern stands afterwards. */
  objection_status?: "buyer_accepted" | "left_open";
  /** objections: what the concern was about. */
  category?: "price" | "trust" | "timing" | "product";
  /** pricing: what the pricing line actually is. */
  kind?: "quote" | "discount_request" | "price_objection";
  /** pricing: the buying signal underneath it. */
  pricing_signal?: "sticker_shock" | "discount_request" | "competitor_price_cited";
};

const NO_STEP = /\bno (clear |agreed |firm |concrete )?next step|nothing (was )?agreed|no follow[ -]?up (was )?(agreed|set|booked)|left without a next step|never landed a next step/i;
const DATED = /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|next week|this week|end of (day|week|month)|next month|q[1-4])\b/i;
const SENDING = /\b(send|sends|sending|sent|share|shares|email|emails|deliver|forward|attach|pull|provide)\b/i;
const SOFT = /\b(circle back|touch base|check in|reconnect|sync|catch up|revisit|follow up|follow-up)\b/i;

const REP_MARKER = /\b(rep|we|our team|i)\b/i;
const BUYER_MARKER = /\b(buyer|prospect|customer|client|they|he|she)\b/i;
const JOINT_MARKER = /\b(both sides|each side|together|mutual)\b/i;

const ADDRESSED = /\b(addressed|answered|resolved|walked (them|him|her|the buyer) through|explained|showed|clarified|reassured|handled|covered off|put to rest|demonstrated)\b/i;
const DEFLECTED = /\b(deflected|dodged|changed the subject|parked|punted)\b/i;
const ACCEPTED = /\b(accepted|satisfied|agreed|happy with|no longer a concern|put to rest|convinced|reassured)\b/i;

const PRICE_WORDS = /\b(price|pricing|cost|costs|discount|budget|per seat|per month|quote|quoted|expensive|renewal price|rate)\b/i;
const TRUST_WORDS = /\b(accuracy|accurate|trust|proof|security|compliance|soc ?2|dpa|sso|privacy|hallucin|legal)\b/i;
const TIMING_WORDS = /\b(timeline|timing|downtime|deadline|delay|months to|go[ -]?live|switch(ing)? (window|cost))\b/i;

const QUOTE_KIND = /\b(quote|quoted|list price|our price|per (seat|month|user|year)|all[ -]in)\b/i;
const DISCOUNT_KIND = /\b(discount|off\b|sharper number|come down|lower (the )?price|match(ing)? .*(price|quote|renewal)|price break)\b/i;
const PRICE_PUSHBACK = /\b(too expensive|stretch|gap|justify|push ?back|sticker|out of (our |the )?budget|cannot afford|can't afford|versus the|questions? the (price|number))\b/i;

const STICKER_SHOCK = /\b(too expensive|sticker|stretch|out of (our |the )?budget|cannot afford|can't afford|sticker shock)\b/i;
const COMPETITOR_PRICE = /\b(counter[ -]?offer(ed)?|countered|competitor(?:'s)? (quote|price|number)|their (quote|price|number)|quoted us|renewal price|match(ing)? .*(renewal|competitor))\b/i;

function nextStepType(text: string): ClaimFacets["type"] {
  if (NO_STEP.test(text)) return "no_next_step";
  if (DATED.test(text)) return "concrete_date";
  if (SENDING.test(text)) return "send_info";
  if (SOFT.test(text)) return "soft_followup";
  return undefined;
}

function nextStepOwner(text: string): ClaimFacets["owner"] {
  if (JOINT_MARKER.test(text)) return "joint";
  const rep = REP_MARKER.test(text);
  const buyer = BUYER_MARKER.test(text);
  if (rep && buyer) return "joint";
  if (rep) return "rep";
  if (buyer) return "buyer";
  return undefined;
}

function objectionCategory(text: string): ClaimFacets["category"] {
  if (PRICE_WORDS.test(text)) return "price";
  if (TRUST_WORDS.test(text)) return "trust";
  if (TIMING_WORDS.test(text)) return "timing";
  return undefined;
}

function pricingKind(text: string): ClaimFacets["kind"] {
  if (DISCOUNT_KIND.test(text)) return "discount_request";
  if (PRICE_PUSHBACK.test(text)) return "price_objection";
  if (QUOTE_KIND.test(text)) return "quote";
  return undefined;
}

function pricingSignal(text: string): ClaimFacets["pricing_signal"] {
  if (STICKER_SHOCK.test(text)) return "sticker_shock";
  if (COMPETITOR_PRICE.test(text)) return "competitor_price_cited";
  if (DISCOUNT_KIND.test(text)) return "discount_request";
  return undefined;
}

/**
 * Derive the routing facets for one claim, from the claim's own words and
 * nothing else. The transcript quote beside it is deliberately not read: the
 * quote is raw call audio in text form, and letting it decide a facet would
 * put an unwritten sentence back in charge of which template fires.
 */
export function deriveFacets(section: TemplateSection, text: string): ClaimFacets {
  const words = text;
  if (section === "next_steps") {
    return { type: nextStepType(words), owner: nextStepOwner(words) };
  }
  if (section === "objections") {
    const handling = ADDRESSED.test(words)
      ? "addressed"
      : DEFLECTED.test(words)
        ? "deflected"
        : "unhandled";
    return {
      handling,
      // An objection stands open unless the call says the buyer took the
      // answer. The default is the cautious one: a template that ships on
      // "buyer accepted" can never fire on a concern nobody closed.
      objection_status: ACCEPTED.test(words) ? "buyer_accepted" : "left_open",
      category: objectionCategory(words),
    };
  }
  if (section === "pricing") {
    return { kind: pricingKind(words), pricing_signal: pricingSignal(words) };
  }
  return {};
}
