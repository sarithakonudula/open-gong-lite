import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PipelineStage,
  suggestStageMove,
} from "../src/lib/hubspot";
import { computeMomentum } from "../src/lib/momentum";
import {
  buildHubspotPlaybook,
  buildLocalPlaybook,
  detectIndustry,
  extractDealAttributes,
  gateSynthesizedInsights,
  rankSimilarDeals,
  similarityScore,
  type HistoricalDeal,
} from "../src/lib/playbook";
import type { DealNotes, RunRecord } from "../src/lib/types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function notes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Discovery",
    summary: [{ text: "s", evidence: { lineId: "L1", quote: "q" }, status: "verified" }],
    objections: [],
    intent: [{ text: "buying", evidence: { lineId: "L1", quote: "q" }, status: "verified" }],
    nextSteps: [{ text: "Demo Thursday", evidence: { lineId: "L2", quote: "demo thursday" }, status: "verified" }],
    pain: [{ text: "Missing after-hours bookings", evidence: { lineId: "L3", quote: "missing bookings" }, status: "verified" }],
    pricing: [{ text: "Quoted twenty-eight per month", evidence: { lineId: "L5", quote: "twenty eight" }, status: "verified" }],
    competitors: [{ text: "RingHawk incumbent", evidence: { lineId: "L4", quote: "ringhawk" }, status: "verified" }],
    followUpEmail: { subject: "s", body: "b", evidence: { lineId: "L1", quote: "q" }, status: "verified" },
    ...overrides,
  };
}

function run(id: string, company: string, n: DealNotes | null, text = ""): RunRecord {
  return {
    id,
    createdAt: "2026-08-14T00:00:00Z",
    updatedAt: "2026-08-14T00:00:00Z",
    status: "shipped",
    source: "upload",
    sourceLabel: company,
    shareToken: "t",
    transcript: text
      ? [{ id: "L1", index: 0, speaker: "S", text }]
      : [],
    notes: n,
    attempts: [],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
  };
}

// ── Attributes ──────────────────────────────────────────────────────────────

describe("deal attributes", () => {
  it("detects industry from transcript language", () => {
    assert.equal(detectIndustry("our dental practice has patients waiting"), "dental");
    assert.equal(detectIndustry("the bank's lending team needs this"), "financial services");
    assert.equal(detectIndustry("hello there"), null);
  });

  it("requirements come from verified claims only", () => {
    const r = run("a", "Brightsmile", notes({
      pain: [
        { text: "Real pain", evidence: { lineId: "L3", quote: "q" }, status: "verified" },
        { text: "Invented pain", evidence: { lineId: "L9", quote: "q" }, status: "uncorroborated" },
      ],
    }), "our dental practice loses patients");
    const attrs = extractDealAttributes(r, "Brightsmile Dental");
    assert.equal(attrs.industry, "dental");
    assert.ok(attrs.requirements.includes("Real pain"));
    assert.ok(!attrs.requirements.includes("Invented pain"));
    assert.deepEqual(attrs.competitors, ["RingHawk incumbent"]);
  });
});

// ── Similarity + playbooks ──────────────────────────────────────────────────

const HISTORY: HistoricalDeal[] = [
  { id: "1", name: "Lakeside Dental Group", amount: 28000, won: true, stage: "closedwon" },
  { id: "2", name: "Downtown Dental Clinic", amount: 31000, won: false, stage: "closedlost" },
  { id: "3", name: "Acme Logistics", amount: 250000, won: true, stage: "closedwon" },
];

describe("similar-deal playbook", () => {
  const attrs = {
    company: "Brightsmile Dental Group",
    industry: "dental",
    dealValueUsd: 30000,
    requirements: ["after-hours routing"],
    competitors: ["RingHawk"],
  };

  it("ranks same-industry, same-size deals above others", () => {
    assert.ok(
      similarityScore(attrs, HISTORY[0]!) > similarityScore(attrs, HISTORY[2]!),
    );
    const { won, lost } = rankSimilarDeals(attrs, HISTORY);
    assert.equal(won[0]!.name, "Lakeside Dental Group");
    assert.equal(lost[0]!.name, "Downtown Dental Clinic");
  });

  it("hubspot playbook is stats over real deals, with refs", () => {
    const { won, lost } = rankSimilarDeals(attrs, HISTORY);
    const pb = buildHubspotPlaybook(attrs, won, lost);
    assert.equal(pb.mode, "hubspot");
    assert.ok(pb.winPatterns[0]!.refs.includes("Lakeside Dental Group"));
    const rate = pb.recommendations.find((r) => r.text.includes("win rate"));
    assert.match(rate!.text, /67%/);
  });

  it("local playbook mines momentum outcomes and says so", () => {
    const advancingRun = run("w1", "Acme", notes({ title: "Acme discovery" } as never));
    const riskRun = run(
      "l1",
      "Umbrella",
      notes({
        title: "Umbrella pricing",
        nextSteps: [{ text: "tbd", evidence: { lineId: "L9", quote: "q" }, status: "uncorroborated" }],
        intent: [{ text: "meh", evidence: { lineId: "L9", quote: "q" }, status: "uncorroborated" }],
        objections: [
          { text: "Too pricey", evidence: { lineId: "L5", quote: "q" }, status: "verified" },
          { text: "Happy today", evidence: { lineId: "L6", quote: "q" }, status: "verified" },
        ],
      }),
    );
    // Sanity: the fixtures land where the test assumes.
    assert.equal(computeMomentum(advancingRun.notes!).direction, "advancing");
    assert.equal(computeMomentum(riskRun.notes!).direction, "at_risk");

    const pb = buildLocalPlaybook(attrs, [advancingRun, riskRun], (r) => r.sourceLabel);
    assert.equal(pb.mode, "local");
    assert.ok(pb.winPatterns[0]!.refs.includes("Acme discovery"));
    assert.ok(pb.lossPatterns[0]!.refs.includes("Umbrella pricing"));
    assert.match(pb.basis, /not closed CRM deals/);
  });

  it("gate drops synthesized insights that cite unknown deals", () => {
    const gated = gateSynthesizedInsights(
      {
        insights: [
          { text: "Real one", refs: ["Lakeside Dental Group"] },
          { text: "Invented deal", refs: ["MegaCorp Whale"] },
          { text: "No refs at all", refs: [] },
        ],
      },
      ["Lakeside Dental Group", "Downtown Dental Clinic"],
    );
    assert.equal(gated.insights.length, 1);
    assert.equal(gated.insights[0]!.text, "Real one");
    assert.equal(gated.dropped, 2);
  });
});

// ── Stage-move suggestions ──────────────────────────────────────────────────

const STAGES: PipelineStage[] = [
  { id: "s1", label: "Discovery", displayOrder: 0, isClosed: false },
  { id: "s2", label: "Demo", displayOrder: 1, isClosed: false },
  { id: "s3", label: "Proposal", displayOrder: 2, isClosed: false },
  { id: "s4", label: "Closed Won", displayOrder: 3, isClosed: true },
];

describe("stage-move suggestions", () => {
  const advancing = computeMomentum(notes());

  it("advancing call with next step suggests exactly one stage forward", () => {
    const s = suggestStageMove("s1", STAGES, advancing)!;
    assert.equal(s.fromLabel, "Discovery");
    assert.equal(s.toLabel, "Demo");
    assert.match(s.reason, /advancing/);
    assert.match(s.reason, /Demo Thursday/);
  });

  it("never suggests moving into a closed stage", () => {
    assert.equal(suggestStageMove("s3", STAGES, advancing), null);
  });

  it("non-advancing calls and missing next steps suggest nothing", () => {
    const stalled = computeMomentum(
      notes({
        nextSteps: [{ text: "tbd", evidence: { lineId: "L9", quote: "q" }, status: "uncorroborated" }],
        intent: [{ text: "meh", evidence: { lineId: "L9", quote: "q" }, status: "uncorroborated" }],
        objections: [
          { text: "o1", evidence: { lineId: "L5", quote: "q" }, status: "verified" },
          { text: "o2", evidence: { lineId: "L6", quote: "q" }, status: "verified" },
        ],
      }),
    );
    assert.equal(suggestStageMove("s1", STAGES, stalled), null);
    assert.equal(suggestStageMove("unknown", STAGES, advancing), null);
    assert.equal(suggestStageMove(null, STAGES, advancing), null);
  });
});
