import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSampleCompanyIndex, companyForRun } from "../src/lib/company";
import { formatDuration, toRecordingRow } from "../src/lib/recording-row";
import { dealState } from "../src/lib/sentiment";
import type { Claim, DealNotes, RunRecord, SampleCall } from "../src/lib/types";

function claim(
  text: string,
  lineId: string,
  status: Claim["status"] = "verified",
): Claim {
  return { text, evidence: { lineId, quote: text.slice(0, 40) }, status };
}

function notes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Pricing & Next Steps",
    summary: [claim("Jane confirmed the proposed tier works", "L4")],
    objections: [],
    intent: [claim("Wants to move forward next month", "L5")],
    nextSteps: [claim("Finance sign-off call booked", "L6")],
    pain: [],
    pricing: [],
    competitors: [],
    followUpEmail: {
      subject: "s",
      body: "b",
      evidence: { lineId: "L4", quote: "Jane confirmed" },
      status: "verified",
    },
    ...overrides,
  };
}

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "r1",
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    status: "shipped",
    source: "upload",
    sourceLabel: "call.mp3",
    shareToken: "abc123",
    transcript: [
      { id: "L1", index: 0, speaker: "Rep", text: "hello", startMs: 0, endMs: 4000 },
      { id: "L2", index: 1, speaker: "Buyer", text: "hi", startMs: 4000, endMs: 92000 },
    ],
    notes: notes(),
    attempts: [],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 1, deadlineMs: 1 },
    ...overrides,
  };
}

const SAMPLES: SampleCall[] = [
  {
    slug: "brightsmile-01-discovery",
    title: "Discovery: Brightsmile Dental, on RingHawk",
    company: "Brightsmile Dental Group",
    durationLabel: "8 min",
    description: "d",
  },
];

describe("companyForRun", () => {
  const index = buildSampleCompanyIndex(SAMPLES);

  it("prefers the explicit company field", () => {
    assert.equal(
      companyForRun(run({ company: "Globex Inc" }), index),
      "Globex Inc",
    );
  });

  it("falls back to the confirmed CRM link", () => {
    const r = run({
      crm: {
        dealId: "1",
        dealName: "Deal",
        company: "Initech",
        linkedAt: "2026-08-14",
      },
    });
    assert.equal(companyForRun(r, index), "Initech");
  });

  it("resolves sample runs to the fixture company", () => {
    const r = run({
      source: "sample",
      sampleSlug: "brightsmile-01-discovery",
    });
    assert.equal(companyForRun(r, index), "Brightsmile Dental Group");
  });

  it("falls back to sourceLabel when nothing else is known", () => {
    assert.equal(companyForRun(run(), index), "call.mp3");
  });
});

describe("toRecordingRow", () => {
  it("uses momentum for the score when no scorecard exists", () => {
    const row = toRecordingRow(run());
    assert.equal(row.scoreSource, "momentum");
    assert.ok(row.score != null && row.score > 50);
    assert.equal(row.callType, "Sales");
    assert.equal(row.dealState, "Positive");
    assert.equal(row.sentimentPct, row.score);
  });

  it("pull-quote comes from a verified claim's evidence", () => {
    const row = toRecordingRow(run());
    assert.equal(row.pullQuote, "Jane confirmed the proposed tier works".slice(0, 40));
  });

  it("duration comes from the last transcript timestamp", () => {
    const row = toRecordingRow(run());
    assert.equal(row.durationMs, 92000);
    assert.equal(formatDuration(row.durationMs), "1:32");
  });

  it("a failed run without notes has no score, state, or tags", () => {
    const row = toRecordingRow(run({ status: "failed", notes: null }));
    assert.equal(row.score, null);
    assert.equal(row.dealState, null);
    assert.deepEqual(row.topics, []);
    assert.equal(row.title, "call.mp3");
  });
});

describe("dealState", () => {
  it("maps momentum directions to the three chips", () => {
    assert.equal(dealState("advancing"), "Positive");
    assert.equal(dealState("steady"), "Neutral");
    assert.equal(dealState("stalling"), "At Risk");
    assert.equal(dealState("at_risk"), "At Risk");
  });
});
