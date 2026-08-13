import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateDealNotes } from "../src/lib/harness/gates";
import type { TranscriptLine } from "../src/lib/types";

const transcript: TranscriptLine[] = [
  {
    id: "L1",
    index: 0,
    speaker: "Rep",
    text: "Every claim links back to the transcript so nothing is made up.",
  },
  {
    id: "L2",
    index: 1,
    speaker: "Prospect",
    text: "Our legal team is worried about hallucinated notes in deal records.",
  },
  {
    id: "L3",
    index: 2,
    speaker: "Prospect",
    text: "Send me a comparison and I'll take it to procurement next week.",
  },
];

function validNotes() {
  return {
    title: "Gate test",
    summary: [
      {
        text: "Citations back to transcript prevent made-up claims.",
        evidence: {
          lineId: "L1",
          quote: "links back to the transcript so nothing is made up",
        },
      },
    ],
    objections: [
      {
        text: "Legal fears hallucinated notes in deal records.",
        evidence: {
          lineId: "L2",
          quote: "worried about hallucinated notes in deal records",
        },
      },
    ],
    intent: [
      {
        text: "Buyer will take a comparison to procurement.",
        evidence: {
          lineId: "L3",
          quote: "take it to procurement next week",
        },
      },
    ],
    nextSteps: [
      {
        text: "Send a comparison for procurement.",
        evidence: {
          lineId: "L3",
          quote: "Send me a comparison",
        },
      },
    ],
    followUpEmail: {
      subject: "Comparison for procurement",
      body: "Attaching the comparison.",
      evidence: {
        lineId: "L3",
        quote: "Send me a comparison",
      },
    },
  };
}

describe("validateDealNotes gates", () => {
  it("ships when every claim has a real receipt", () => {
    const result = validateDealNotes(validNotes(), transcript);
    assert.equal(result.ok, true);
  });

  it("rejects unknown evidence line ids", () => {
    const notes = validNotes();
    notes.summary[0].evidence.lineId = "L999";
    const result = validateDealNotes(notes, transcript);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.failures.some((f) => f.code === "missing_evidence_line"),
      );
    }
  });

  it("rejects quotes that are not supported by the line", () => {
    const notes = validNotes();
    notes.objections[0].evidence.quote =
      "totally fabricated quote about unicorn pricing";
    const result = validateDealNotes(notes, transcript);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.failures.some((f) => f.code === "unproven_claim"));
    }
  });

  it("rejects schema-invalid payloads", () => {
    const result = validateDealNotes({ title: "x" }, transcript);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.failures.some((f) => f.code === "bad_json_schema"));
    }
  });
});
