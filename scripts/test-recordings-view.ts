import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeNotifications,
  dealStateFor,
  formatTimestamp,
  tagsFor,
  toRecordingRow,
} from "../src/lib/recordings-view";
import type { DealNotes, RunRecord } from "../src/lib/types";

function notes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Pricing & Next Steps",
    summary: [
      { text: "Pricing tier works for the budget", evidence: { lineId: "L2", quote: "the pricing works like this" }, status: "verified" },
    ],
    objections: [],
    intent: [{ text: "Wants to move next month", evidence: { lineId: "L2", quote: "love to move forward next month" }, status: "verified" }],
    nextSteps: [{ text: "Send SLA docs", evidence: { lineId: "L4", quote: "asked for documentation" }, status: "verified" }],
    pain: [],
    pricing: [{ text: "Tier covers everything", evidence: { lineId: "L2", quote: "this tier covers everything" }, status: "verified" }],
    competitors: [],
    followUpEmail: { subject: "s", body: "b", evidence: { lineId: "L2", quote: "q" }, status: "verified" },
    coverage: {
      band: "SHIPPED",
      ratio: 0.9,
      stats: { verified: 9, segment_corrected: 0, uncorroborated: 1, blocked_injection: 0, attempted: 10, corroborated: 9 },
    },
    ...overrides,
  };
}

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "r1",
    createdAt: "2026-08-14T09:00:00Z",
    updatedAt: "2026-08-14T09:00:00Z",
    status: "shipped",
    source: "upload",
    sourceLabel: "Globex call",
    shareToken: "t",
    transcript: [
      { id: "L1", index: 0, speaker: "Sophia", text: "Happy to walk you through pricing and the proposal.", startMs: 0, endMs: 30000 },
      { id: "L2", index: 1, speaker: "Jane", text: "If the pricing works like this, we'd love to move forward next month. This tier covers everything.", startMs: 252000, endMs: 280000 },
      { id: "L4", index: 2, speaker: "Jane", text: "She asked for documentation on the SLAs.", startMs: 708000, endMs: 720000 },
    ],
    notes: notes(),
    attempts: [],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
    ...overrides,
  };
}

describe("recordings view-model", () => {
  it("maps a sales run: momentum score, Positive state, gated tags and quote", () => {
    const row = toRecordingRow(run(), () => "Globex Inc");
    assert.equal(row.company, "Globex Inc");
    assert.equal(row.scoreBasis, "momentum");
    assert.equal(row.dealState, "Positive");
    assert.ok(row.score >= 70);
    assert.deepEqual(row.tags, ["pricing", "next steps", "high intent"]);
    assert.equal(row.quote, "the pricing works like this");
    assert.equal(row.durationLabel, "12 min");
  });

  it("deal state mapping is exact", () => {
    assert.equal(dealStateFor("sales", "advancing"), "Positive");
    assert.equal(dealStateFor("sales", "steady"), "Neutral");
    assert.equal(dealStateFor("sales", "stalling"), "Neutral");
    assert.equal(dealStateFor("sales", "at_risk"), "At Risk");
    assert.equal(dealStateFor("support", "advancing"), "Neutral");
  });

  it("unproven claims never become tags", () => {
    const r = run({
      notes: notes({
        pricing: [{ text: "x", evidence: { lineId: "L9", quote: "q" }, status: "uncorroborated" }],
      }),
    });
    assert.ok(!tagsFor(r, "sales").includes("pricing"));
  });

  it("timestamps format from startMs, fall back to line id", () => {
    assert.equal(formatTimestamp(252000, "L2"), "04:12");
    assert.equal(formatTimestamp(undefined, "L2"), "L2");
  });

  it("notifications compose from state, risk first when newest", () => {
    const row = toRecordingRow(run(), () => "Globex Inc");
    const items = composeNotifications({
      rows: [row],
      digestEntries: [
        {
          company: "Umbrella Co",
          riskAlerts: [
            { title: "Deal gone quiet", detail: "No activity for 14 days" } as never,
          ],
          momentum: { score: 28, direction: "at_risk" },
          latestRunId: "r1",
        },
        {
          company: "Globex Inc",
          riskAlerts: [],
          momentum: { score: 87, direction: "advancing" },
          latestRunId: "r1",
        },
      ],
      profiles: [
        {
          rep: "Sophia",
          calls: [
            { runId: "a", at: "1", title: "t", score: 60 },
            { runId: "b", at: "2", title: "t", score: 70 },
          ],
          focus: [{ traitId: "metrics" } as never],
          scoreTrend: 10,
        },
      ],
      templateTitles: ["Pricing follow-up"],
    });
    const kinds = items.map((i) => i.kind);
    assert.ok(kinds.includes("risk"));
    assert.ok(kinds.includes("positive"));
    assert.ok(kinds.includes("coaching"));
    assert.ok(kinds.includes("performer"));
    assert.ok(kinds.includes("template"));
    const risk = items.find((i) => i.kind === "risk")!;
    assert.match(risk.title, /Umbrella Co flagged as at risk/);
    assert.match(risk.body, /Deal gone quiet/);
  });
});
