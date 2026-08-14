import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMomentum, renderMomentum } from "../src/lib/momentum";
import type { DealNotes } from "../src/lib/types";

function claim(text: string, lineId: string, status: "verified" | "uncorroborated" = "verified") {
  return { text, evidence: { lineId, quote: text.slice(0, 30) }, status } as const;
}

function baseNotes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Test call",
    summary: [claim("We discussed rollout", "L1")],
    objections: [],
    intent: [claim("Ready to move this quarter", "L2")],
    nextSteps: [claim("Demo booked Thursday", "L3")],
    pain: [],
    pricing: [],
    competitors: [],
    followUpEmail: {
      subject: "s",
      body: "b",
      evidence: { lineId: "L1", quote: "We discussed" },
      status: "verified",
    },
    ...overrides,
  };
}

describe("momentum", () => {
  it("is deterministic — same notes, same score", () => {
    const a = computeMomentum(baseNotes());
    const b = computeMomentum(baseNotes());
    assert.deepEqual(a, b);
  });

  it("scores a call with a next step and intent as advancing", () => {
    const m = computeMomentum(baseNotes());
    assert.equal(m.direction, "advancing");
    assert.ok(m.score >= 70);
    assert.equal(m.nextAction, "Demo booked Thursday");
  });

  it("every claim-driven reason carries a receipt", () => {
    const m = computeMomentum(baseNotes());
    const cited = m.reasons.filter((r) => r.lineId);
    assert.ok(cited.length >= 2);
    for (const r of cited) assert.ok(r.quote && r.quote.length > 0);
  });

  it("forces at_risk when no next step and multiple objections", () => {
    const m = computeMomentum(
      baseNotes({
        nextSteps: [claim("Maybe later", "L4", "uncorroborated")],
        objections: [claim("Price too high", "L5"), claim("Locked into RingHawk", "L6")],
        intent: [claim("Just exploring", "L7", "uncorroborated")],
      }),
    );
    assert.equal(m.direction, "at_risk");
  });

  it("ignores unproven claims entirely", () => {
    const withFake = computeMomentum(
      baseNotes({
        pricing: [claim("Agreed to 40% discount", "L9", "uncorroborated")],
      }),
    );
    const without = computeMomentum(baseNotes());
    assert.equal(withFake.score, without.score);
  });

  it("penalizes low coverage bands", () => {
    const clean = computeMomentum(baseNotes());
    const partial = computeMomentum(
      baseNotes({
        coverage: {
          band: "PARTIAL_LOW_COVERAGE",
          ratio: 0.4,
          stats: {
            verified: 2,
            segment_corrected: 0,
            uncorroborated: 3,
            blocked_injection: 0,
            attempted: 5,
            corroborated: 2,
          },
        },
      }),
    );
    assert.ok(partial.score < clean.score);
  });

  it("renders with receipts", () => {
    const text = renderMomentum(computeMomentum(baseNotes()));
    assert.match(text, /Momentum: \d+\/100/);
    assert.match(text, /\[L3\]/);
  });
});
