import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRepProfile,
  detectRepSpeaker,
  renderCoachingPlan,
  repSlug,
} from "../src/lib/coaching";
import type {
  MethodologyScorecard,
  ScoredTrait,
} from "../src/lib/methodology";
import type { TranscriptLine } from "../src/lib/types";

function trait(
  id: string,
  name: string,
  points: number | null,
  opts: { quote?: string; gap?: string } = {},
): ScoredTrait {
  return {
    trait: {
      id,
      name,
      weight: 3,
      rigor: "core",
      definition: `${name} definition`,
      classifying_questions: ["q?"],
      met_signals: [],
      miss_signals: [],
      coaching: {
        why_it_matters: `${name} ties the deal to money.`,
        next_move: `Ask one ${name} question on the next call.`,
        example_line: `What does a missed month of ${name} cost you?`,
      },
    },
    verdict:
      points == null
        ? null
        : {
            id,
            depth: "surface",
            confidence: 0.8,
            evidence: [],
            gap: opts.gap ?? `${name} stayed shallow`,
            gatedEvidence: opts.quote
              ? [{ lineId: "L4", quote: opts.quote, status: "verified" }]
              : [],
            unverified: false,
            effectiveDepth: "surface",
          },
    inScope: points != null,
    points,
  };
}

function card(score: number, traitPoints: Record<string, number | null>): MethodologyScorecard {
  return {
    pack: {
      id: "meddic",
      name: "MEDDIC",
      summary: "s",
      traits: [],
    },
    band: null,
    dealValueUsd: 30_000,
    score,
    callType: "discovery",
    overallNote: "",
    contextFlags: [],
    traits: Object.entries(traitPoints).map(([id, points]) =>
      trait(id, id.replace(/_/g, " "), points, {
        quote: id === "metrics" ? "we lose some bookings I guess" : undefined,
      }),
    ),
    evidenceStats: { total: 3, corroborated: 3, unverifiedTraits: 0 },
  };
}

const repLines: TranscriptLine[] = [
  { id: "L1", index: 0, speaker: "Maya", text: "I'll send over pricing and we can walk you through the demo." },
  { id: "L2", index: 1, speaker: "Rahul", text: "We keep missing after-hours calls." },
  { id: "L3", index: 2, speaker: "Maya", text: "What does a missed booking cost you? And who else would weigh in?" },
  { id: "L4", index: 3, speaker: "Rahul", text: "Probably a lot." },
];

describe("coaching loop", () => {
  it("detects the rep by seller language, not line count", () => {
    assert.equal(detectRepSpeaker(repLines), "Maya");
    assert.equal(detectRepSpeaker([]), null);
  });

  it("trends traits across calls and picks the weakest as focus", () => {
    const profile = buildRepProfile("Maya", [
      { runId: "r1", at: "2026-08-01T00:00:00Z", title: "Call 1", card: card(55, { metrics: 1, champion: 2, decision_process: 3 }) },
      { runId: "r2", at: "2026-08-08T00:00:00Z", title: "Call 2", card: card(62, { metrics: 1, champion: 3, decision_process: 3 }) },
    ]);
    assert.equal(profile.calls.length, 2);
    assert.equal(profile.scoreTrend, 7);
    const metrics = profile.traits.find((t) => t.traitId === "metrics")!;
    assert.deepEqual(metrics.history, [1, 1]);
    assert.equal(profile.focus[0]!.traitId, "metrics");
    const champion = profile.traits.find((t) => t.traitId === "champion")!;
    assert.equal(champion.trend, 1);
    assert.equal(champion.status, "strength");
  });

  it("drills are personalized with the rep's own gated quote", () => {
    const profile = buildRepProfile("Maya", [
      { runId: "r1", at: "2026-08-01T00:00:00Z", title: "Call 1", card: card(55, { metrics: 1, champion: 3 }) },
    ]);
    const drill = profile.drills.find((d) => d.traitId === "metrics")!;
    assert.equal(drill.yourMoment?.quote, "we lose some bookings I guess");
    assert.equal(drill.yourMoment?.runId, "r1");
    assert.match(drill.nextMove, /next call/);
    assert.match(drill.exampleLine, /cost you/);
  });

  it("renders a plan with receipts and mastery lines", () => {
    const profile = buildRepProfile("Maya", [
      { runId: "r1", at: "2026-08-01T00:00:00Z", title: "Call 1", card: card(55, { metrics: 1 }) },
    ]);
    const plan = renderCoachingPlan(profile);
    assert.match(plan, /Coaching plan — Maya/);
    assert.match(plan, /What you said: "we lose some bookings I guess" \[L4\]/);
    assert.match(plan, /What mastery sounds like/);
  });

  it("slugs rep names safely", () => {
    assert.equal(repSlug("Maya (CallForge)"), "maya-callforge");
    assert.equal(repSlug("!!!"), "rep");
  });
});
