import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gateEvidenceQuote,
  normalizeQuote,
  validateDealNotes,
} from "../src/lib/harness/gates";
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

/** Stereo-style fixture for L7 fidelity (forty must not fold to 40). */
const stereoTranscript: TranscriptLine[] = [
  {
    id: "L1",
    index: 0,
    speaker: "Rep",
    text: "Hi Rahul, thanks for taking the time today. I wanted to walk you through how our dialer handles compliance.",
  },
  {
    id: "L2",
    index: 1,
    speaker: "Prospect",
    text: "Honestly, my main concern is pricing. Your competitor quoted as almost forty less last week.",
  },
  {
    id: "L3",
    index: 2,
    speaker: "Rep",
    text: "That is fair. Let me show you the total cost picture including answering machine detection.",
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

describe("normalizeQuote", () => {
  it("strips punctuation but keeps digits (no digit folding)", () => {
    assert.equal(normalizeQuote("Almost 40 less!"), "almost 40 less");
    assert.equal(normalizeQuote("almost forty less."), "almost forty less");
    assert.notEqual(
      normalizeQuote("almost 40 less"),
      normalizeQuote("almost forty less"),
    );
  });
});

describe("gateEvidenceQuote L7 chain", () => {
  it("match_exact for contiguous substring", () => {
    const g = gateEvidenceQuote(
      "almost forty less last week",
      "L2",
      stereoTranscript,
    );
    assert.equal(g.verdict, "match_exact");
    assert.equal(g.matchedLineId, "L2");
  });

  it("match_normalized when punctuation differs", () => {
    const g = gateEvidenceQuote(
      "Honestly my main concern is pricing",
      "L2",
      stereoTranscript,
    );
    assert.equal(g.verdict, "match_normalized");
  });

  it("rejects digit-folded forty→40 as uncorroborated", () => {
    const g = gateEvidenceQuote(
      "your competitor quoted as almost 40 less last week",
      "L2",
      stereoTranscript,
    );
    assert.equal(g.verdict, "uncorroborated");
  });

  it("rejects fully hallucinated quotes", () => {
    const g = gateEvidenceQuote(
      "we can set up a free trial for next quarter",
      "L3",
      stereoTranscript,
    );
    assert.equal(g.verdict, "uncorroborated");
  });

  it("segment_corrected rescues long unique quote with wrong lineId", () => {
    const g = gateEvidenceQuote(
      "let me show you the total cost picture including answering machine detection",
      "L1",
      stereoTranscript,
    );
    assert.equal(g.verdict, "segment_corrected");
    assert.equal(g.matchedLineId, "L3");
  });
});

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

  it("rewrites lineId on segment_corrected and ships", () => {
    const notes = {
      title: "Stereo pricing",
      summary: [
        {
          text: "Rep frames dialer compliance agenda.",
          evidence: {
            lineId: "L1",
            quote: "walk you through how our dialer handles compliance",
          },
        },
      ],
      objections: [
        {
          text: "Pricing concern; competitor almost forty less.",
          evidence: {
            lineId: "L2",
            quote: "almost forty less last week",
          },
        },
      ],
      intent: [
        {
          text: "Will review total cost picture.",
          evidence: {
            // Wrong line on purpose — unique long quote lives on L3
            lineId: "L1",
            quote:
              "let me show you the total cost picture including answering machine detection",
          },
        },
      ],
      nextSteps: [
        {
          text: "Walk total cost including AMD.",
          evidence: {
            lineId: "L3",
            quote: "total cost picture including answering machine detection",
          },
        },
      ],
      followUpEmail: {
        subject: "Total cost picture",
        body: "As discussed.",
        evidence: {
          lineId: "L3",
          quote: "total cost picture including answering machine detection",
        },
      },
    };

    const result = validateDealNotes(notes, stereoTranscript);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.notes.intent[0]!.evidence.lineId, "L3");
    }
  });

  it("blocks adversarial digit-fold claim (forty vs 40)", () => {
    const notes = {
      title: "Adversarial",
      summary: [
        {
          text: "Ok",
          evidence: {
            lineId: "L1",
            quote: "dialer handles compliance",
          },
        },
      ],
      objections: [
        {
          text: "Prospect says competitor quoted about 40% less.",
          evidence: {
            lineId: "L2",
            quote: "your competitor quoted as almost 40 less last week",
          },
        },
      ],
      intent: [
        {
          text: "Pricing concern.",
          evidence: {
            lineId: "L2",
            quote: "main concern is pricing",
          },
        },
      ],
      nextSteps: [
        {
          text: "Show cost picture.",
          evidence: {
            lineId: "L3",
            quote: "total cost picture",
          },
        },
      ],
      followUpEmail: {
        subject: "Follow up",
        body: "Hi",
        evidence: {
          lineId: "L3",
          quote: "total cost picture",
        },
      },
    };

    const result = validateDealNotes(notes, stereoTranscript);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.failures.some(
          (f) => f.path === "objections[0]" && f.code === "unproven_claim",
        ),
      );
    }
  });
});
