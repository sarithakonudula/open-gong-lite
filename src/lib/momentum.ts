// Deal momentum — did this call advance or stall the deal?
//
// Deterministic scoring over GATED claims only, so every reason carries a
// receipt (the claim's lineId). No LLM, no keys: the same call always scores
// the same. Feeds the management digest and the HubSpot write-back
// (ai_momentum_score / ai_momentum_direction).

import { Claim, DealNotes, isEmailableStatus } from "@/lib/types";

export type MomentumDirection = "advancing" | "steady" | "stalling" | "at_risk";

export type MomentumReason = {
  text: string;
  delta: number;
  /** Receipt: the transcript line behind the claim that moved the score. */
  lineId?: string;
  quote?: string;
};

export const MOMENTUM_SCHEMA = "opengong.momentum";
export const MOMENTUM_VERSION = 1;

export type MomentumResult = {
  schema: typeof MOMENTUM_SCHEMA;
  version: typeof MOMENTUM_VERSION;
  score: number;
  direction: MomentumDirection;
  reasons: MomentumReason[];
  /** Top verified next step — becomes ai_next_action in the CRM. */
  nextAction: string | null;
};

function corroborated(claims: Claim[] | undefined): Claim[] {
  return (claims ?? []).filter((c) => isEmailableStatus(c.status));
}

function reasonFor(claim: Claim, text: string, delta: number): MomentumReason {
  return {
    text,
    delta,
    lineId: claim.evidence.lineId,
    quote: claim.evidence.quote,
  };
}

export function computeMomentum(notes: DealNotes): MomentumResult {
  let score = 50;
  const reasons: MomentumReason[] = [];
  const add = (r: MomentumReason) => {
    score += r.delta;
    reasons.push(r);
  };

  const nextSteps = corroborated(notes.nextSteps);
  for (const c of nextSteps.slice(0, 2)) {
    add(reasonFor(c, `Concrete next step agreed: ${c.text}`, 12));
  }
  if (nextSteps.length === 0) {
    add({ text: "No verified next step came out of this call", delta: -15 });
  }

  const intent = corroborated(notes.intent);
  for (const c of intent.slice(0, 2)) {
    add(reasonFor(c, `Buying intent on the record: ${c.text}`, 8));
  }

  const pricing = corroborated(notes.pricing);
  if (pricing.length > 0) {
    add(reasonFor(pricing[0]!, "Pricing was discussed openly", 6));
  }

  const pain = corroborated(notes.pain);
  if (pain.length > 0) {
    add(reasonFor(pain[0]!, `Pain acknowledged: ${pain[0]!.text}`, 4));
  }

  // We can't tell from gated claims whether an objection was resolved on the
  // call, so the penalty is softened when the call still produced a verified
  // next step — an objection that didn't stop the deal moving is a watch
  // item, not a stall signal.
  const objections = corroborated(notes.objections);
  const objectionDelta = nextSteps.length > 0 ? -4 : -8;
  for (const c of objections.slice(0, 3)) {
    add(
      reasonFor(
        c,
        `Objection raised${nextSteps.length > 0 ? " (call still advanced)" : ""}: ${c.text}`,
        objectionDelta,
      ),
    );
  }

  const competitors = corroborated(notes.competitors);
  for (const c of competitors.slice(0, 2)) {
    add(reasonFor(c, `Competitor in the deal: ${c.text}`, -5));
  }

  const band = notes.coverage?.band;
  if (band === "FAILED_UNPROVEN") {
    add({ text: "Notes failed the receipts gate — nothing here is proven", delta: -20 });
  } else if (band === "PARTIAL_CLAIMS_DROPPED" || band === "PARTIAL_LOW_COVERAGE") {
    add({ text: "Low receipt coverage — treat this read with caution", delta: -10 });
  }

  score = Math.max(0, Math.min(100, score));

  let direction: MomentumDirection =
    score >= 70
      ? "advancing"
      : score >= 45
        ? "steady"
        : score >= 25
          ? "stalling"
          : "at_risk";
  // Hard floor: no verified next step + multiple open objections is a risk
  // pattern regardless of what the rest of the call added up to.
  if (nextSteps.length === 0 && objections.length >= 2) {
    direction = "at_risk";
  }

  return {
    schema: MOMENTUM_SCHEMA,
    version: MOMENTUM_VERSION,
    score,
    direction,
    reasons,
    nextAction: nextSteps[0]?.text ?? null,
  };
}

const DIRECTION_BADGE: Record<MomentumDirection, string> = {
  advancing: "🟢 advancing",
  steady: "🟡 steady",
  stalling: "🟠 stalling",
  at_risk: "🔴 at risk",
};

export function renderMomentum(m: MomentumResult): string {
  const lines = [`**Momentum: ${m.score}/100 · ${DIRECTION_BADGE[m.direction]}**`];
  for (const r of m.reasons) {
    const sign = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
    lines.push(`- (${sign}) ${r.text}${r.lineId ? ` [${r.lineId}]` : ""}`);
  }
  if (m.nextAction) lines.push(`- Next action: ${m.nextAction}`);
  return lines.join("\n");
}
