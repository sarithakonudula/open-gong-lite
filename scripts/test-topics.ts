import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveTopics } from "../src/lib/topics";
import type { Claim, DealNotes } from "../src/lib/types";

function claim(
  text: string,
  lineId: string,
  status: Claim["status"] = "verified",
  quote?: string,
): Claim {
  return { text, evidence: { lineId, quote: quote ?? text.slice(0, 30) }, status };
}

function notes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Test call",
    summary: [claim("We discussed the rollout", "L1")],
    objections: [],
    intent: [],
    nextSteps: [],
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

describe("topics", () => {
  it("is deterministic — same notes, same tags", () => {
    const a = deriveTopics(notes());
    const b = deriveTopics(notes());
    assert.deepEqual(a, b);
  });

  it("maps corroborated sections to their tags", () => {
    const tags = deriveTopics(
      notes({
        pricing: [claim("Quoted the growth tier", "L4")],
        competitors: [claim("They mentioned RingHawk", "L5")],
        intent: [claim("Wants to move next month", "L6")],
        nextSteps: [claim("Demo booked Thursday", "L7")],
      }),
    );
    assert.ok(tags.includes("pricing"));
    assert.ok(tags.includes("competitor"));
    assert.ok(tags.includes("high intent"));
    assert.ok(tags.includes("next steps"));
  });

  it("ignores uncorroborated claims — unproven notes never become tags", () => {
    const tags = deriveTopics(
      notes({
        pricing: [claim("Budget talk", "L4", "uncorroborated")],
        competitors: [claim("Competitor talk", "L5", "uncorroborated")],
      }),
    );
    assert.ok(!tags.includes("competitor"));
  });

  it("finds keyword topics inside verified claim text", () => {
    const tags = deriveTopics(
      notes({
        summary: [
          claim("They asked about budget and a timeline for go-live", "L2"),
        ],
      }),
    );
    assert.ok(tags.includes("budget"));
    assert.ok(tags.includes("timeline"));
  });

  it("caps the tag list at five", () => {
    const tags = deriveTopics(
      notes({
        summary: [claim("budget timeline demo follow up on everything", "L2")],
        pricing: [claim("Quoted the growth tier", "L4")],
        competitors: [claim("They mentioned RingHawk", "L5")],
        intent: [claim("Wants to move next month", "L6")],
        nextSteps: [claim("Demo booked Thursday", "L7")],
        objections: [claim("Worried about switching", "L8")],
      }),
    );
    assert.ok(tags.length <= 5);
  });
});
