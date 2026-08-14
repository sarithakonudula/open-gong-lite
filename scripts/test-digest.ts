import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDigest } from "../src/lib/digest";
import type { DealNotes, RunRecord } from "../src/lib/types";

function notes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Discovery call",
    summary: [
      { text: "Wants after-hours routing", evidence: { lineId: "L1", quote: "after-hours" }, status: "verified" },
      { text: "Invented fact", evidence: { lineId: "L2", quote: "nope" }, status: "uncorroborated" },
    ],
    objections: [],
    intent: [{ text: "Moving this quarter", evidence: { lineId: "L3", quote: "this quarter" }, status: "verified" }],
    nextSteps: [{ text: "Demo Thursday", evidence: { lineId: "L4", quote: "Thursday" }, status: "verified" }],
    pain: [],
    pricing: [],
    competitors: [],
    followUpEmail: {
      subject: "s",
      body: "b",
      evidence: { lineId: "L1", quote: "after-hours" },
      status: "verified",
    },
    ...overrides,
  };
}

function run(id: string, company: string, createdAt: string, n: DealNotes | null): RunRecord {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    status: "shipped",
    source: "sample",
    sourceLabel: company,
    shareToken: "t",
    transcript: [],
    notes: n,
    attempts: [],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
  };
}

const NOW = "2026-08-14T09:00:00Z";

describe("management digest", () => {
  it("groups by company, newest run wins, risk sorts first", () => {
    const stalled = notes({
      nextSteps: [{ text: "none", evidence: { lineId: "L9", quote: "x" }, status: "uncorroborated" }],
      objections: [
        { text: "Too expensive", evidence: { lineId: "L5", quote: "expensive" }, status: "verified" },
        { text: "Happy with incumbent", evidence: { lineId: "L6", quote: "happy" }, status: "verified" },
      ],
      intent: [{ text: "meh", evidence: { lineId: "L7", quote: "meh" }, status: "uncorroborated" }],
    });
    const digest = buildDigest(
      [
        run("a1", "Acme", "2026-08-01T00:00:00Z", notes()),
        run("a2", "Acme", "2026-08-10T00:00:00Z", notes({ title: "Acme call 2" })),
        run("b1", "Brightsmile", "2026-08-12T00:00:00Z", stalled),
        run("c1", "NoNotes", "2026-08-12T00:00:00Z", null),
      ],
      { companyForRun: (r) => r.sourceLabel, now: NOW },
    );
    assert.equal(digest.totals.companies, 2);
    assert.equal(digest.totals.calls, 3);
    assert.equal(digest.entries[0]!.company, "Brightsmile"); // at-risk first
    assert.equal(digest.entries[0]!.momentum?.direction, "at_risk");
    const acme = digest.entries.find((e) => e.company === "Acme")!;
    assert.equal(acme.callCount, 2);
    assert.equal(acme.latestRun.id, "a2");
  });

  it("only verified claims reach the digest", () => {
    const digest = buildDigest([run("a1", "Acme", NOW, notes())], {
      companyForRun: (r) => r.sourceLabel,
      now: NOW,
    });
    assert.match(digest.markdown, /Wants after-hours routing \[L1\]/);
    assert.doesNotMatch(digest.markdown, /Invented fact/);
  });

  it("markdown is deterministic for a frozen now", () => {
    const build = () =>
      buildDigest([run("a1", "Acme", "2026-08-01T00:00:00Z", notes())], {
        companyForRun: (r) => r.sourceLabel,
        now: NOW,
      }).markdown;
    assert.equal(build(), build());
  });
});
