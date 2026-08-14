// Deal-state / "sentiment" labels for the light UI.
//
// There is no tone analysis in the pipeline, and we do not fake one. The
// number shown as "sentiment" is the deterministic momentum score (0-100 over
// gated claims, every reason receipt-backed); the chip is a relabel of the
// momentum direction. UI surfaces that show it must carry the basis caption.

import { computeMomentum, MomentumDirection } from "@/lib/momentum";
import type { DealNotes } from "@/lib/types";

export type DealStateLabel = "Positive" | "Neutral" | "At Risk";

export const SENTIMENT_BASIS_CAPTION =
  "Derived from verified deal signals (momentum), not tone analysis.";

export function dealState(direction: MomentumDirection): DealStateLabel {
  if (direction === "advancing") return "Positive";
  if (direction === "steady") return "Neutral";
  return "At Risk";
}

export function dealStateChipClass(state: DealStateLabel): string {
  if (state === "Positive") return "chip-positive";
  if (state === "Neutral") return "chip-neutral";
  return "chip-risk";
}

export type CallSentiment = {
  pct: number;
  state: DealStateLabel;
  basis: "momentum";
};

export function callSentiment(notes: DealNotes): CallSentiment {
  const momentum = computeMomentum(notes);
  return {
    pct: momentum.score,
    state: dealState(momentum.direction),
    basis: "momentum",
  };
}
