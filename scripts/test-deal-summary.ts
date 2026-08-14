import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupRunsByCompany,
  normalizeCompanyKey,
} from "../src/lib/company";
import {
  callDateForRun,
  collectCompanyEvidence,
  deterministicDealSummary,
  generateDealSummary,
  parseDealSummary,
} from "../src/lib/deal-summary";
import { dealSummaryInputsHash } from "../src/lib/deal-summary-store";
import type { DealNotes, RunRecord } from "../src/lib/types";

function notes(overrides: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Discovery call",
    summary: [
      {
        text: "Wants after-hours routing for the Denver office",
        evidence: { lineId: "L1", quote: "after-hours routing" },
        status: "verified",
      },
      {
        text: "Invented fact",
        evidence: { lineId: "L2", quote: "nope" },
        status: "uncorroborated",
      },
    ],
    objections: [],
    intent: [],
    nextSteps: [
      {
        text: "Demo Thursday with the ops lead",
        evidence: { lineId: "L4", quote: "Thursday" },
        status: "verified",
      },
    ],
    pain: [],
    pricing: [],
    competitors: [],
    followUpEmail: {
      subject: "s",
      body: "b",
      evidence: { lineId: "L1", quote: "after-hours routing" },
      status: "verified",
    },
    ...overrides,
  };
}

function run(
  id: string,
  company: string,
  createdAt: string,
  n: DealNotes | null,
  extra: Partial<RunRecord> = {},
): RunRecord {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    status: "shipped",
    source: "sample",
    sourceLabel: company,
    shareToken: "t",
    transcript: [
      { id: "L1", index: 0, speaker: "Rep", text: "after-hours routing", startMs: 41_000 },
      { id: "L4", index: 1, speaker: "Prospect", text: "Thursday works", startMs: 725_000 },
    ],
    notes: n,
    attempts: [],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
    ...extra,
  };
}

const NOW = "2026-08-14T09:00:00Z";

describe("normalizeCompanyKey", () => {
  it("merges suffix variants of one company", () => {
    assert.equal(
      normalizeCompanyKey("Brightsmile Dental"),
      normalizeCompanyKey("Brightsmile Dental Group"),
    );
    assert.equal(normalizeCompanyKey("Acme, Inc."), "acme");
    assert.equal(normalizeCompanyKey("acme corp"), "acme");
    assert.equal(normalizeCompanyKey("Acme"), "acme");
  });
  it("never strips a name to nothing", () => {
    assert.equal(normalizeCompanyKey("Group"), "group");
    assert.equal(normalizeCompanyKey("  "), "unknown");
  });
});

describe("groupRunsByCompany", () => {
  it("merges spelling variants and shows the newest run's name", () => {
    const groups = groupRunsByCompany([
      run("a", "Brightsmile Dental", "2026-08-01T00:00:00Z", notes()),
      run("b", "Brightsmile Dental Group", "2026-08-10T00:00:00Z", notes()),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.key, "brightsmile-dental");
    assert.equal(groups[0]!.displayName, "Brightsmile Dental Group");
    assert.equal(groups[0]!.runs[0]!.id, "b");
  });
});

describe("collectCompanyEvidence", () => {
  it("orders calls chronologically, filters unbacked and category claims", () => {
    const categoryNotes = notes({
      summary: [
        {
          text: "Pricing, seats, or renewal came up on the call.",
          evidence: { lineId: "L1", quote: "x" },
          status: "verified",
        },
        {
          text: "Wants to cut the Aircall bill by a third",
          evidence: { lineId: "L1", quote: "after-hours routing" },
          status: "verified",
        },
      ],
    });
    const groups = groupRunsByCompany([
      run("new", "Acme", "2026-08-10T00:00:00Z", categoryNotes),
      run("old", "Acme", "2026-08-01T00:00:00Z", notes()),
    ]);
    const ev = collectCompanyEvidence(groups[0]!);
    assert.equal(ev.calls.length, 2);
    assert.equal(ev.calls[0]!.runId, "old");
    assert.equal(ev.calls[1]!.ordinal, 2);
    const texts = ev.claims.map((c) => c.text);
    assert.ok(!texts.includes("Invented fact"));
    assert.ok(!texts.some((t) => t.includes("came up on the call")));
    assert.ok(texts.includes("Wants to cut the Aircall bill by a third"));
    assert.equal(ev.claims[0]!.ref, "c1");
    assert.equal(ev.claims[0]!.timeLabel, "0:41");
  });

  it("honours callDate over createdAt", () => {
    const historic = run("h", "Acme", "2026-08-10T00:00:00Z", notes(), {
      callDate: "2026-07-01T00:00:00Z",
    });
    assert.equal(callDateForRun(historic), "2026-07-01T00:00:00Z");
    const groups = groupRunsByCompany([
      historic,
      run("recent", "Acme", "2026-08-05T00:00:00Z", notes()),
    ]);
    const ev = collectCompanyEvidence(groups[0]!);
    assert.equal(ev.calls[0]!.runId, "h");
  });
});

describe("parseDealSummary", () => {
  const ev = collectCompanyEvidence(
    groupRunsByCompany([run("a", "Acme", NOW, notes())])[0]!,
  );

  it("filters unknown refs and drops refless items", () => {
    const summary = parseDealSummary(
      {
        headline: "Deal is moving.",
        narrative: [
          { text: "Backed by a real claim", refs: ["c1", "c999"] },
          { text: "Hallucinated item", refs: ["c999"] },
        ],
        resolved: [],
        open: [],
        risks: [],
      },
      ev,
      { generatedAt: NOW },
    );
    assert.equal(summary.narrative.length, 1);
    assert.deepEqual(summary.narrative[0]!.refs, ["c1"]);
    assert.ok(summary.receipts.c1);
    assert.equal(summary.receipts.c1!.runId, "a");
    assert.equal(summary.receipts.c999, undefined);
  });

  it("throws when nothing survives the grounding gate", () => {
    assert.throws(() =>
      parseDealSummary(
        {
          headline: "All invented.",
          narrative: [{ text: "Made up", refs: ["c999"] }],
        },
        ev,
        { generatedAt: NOW },
      ),
    );
  });
});

describe("generateDealSummary", () => {
  const group = groupRunsByCompany([
    run("a1", "Acme", "2026-08-01T00:00:00Z", notes()),
    run("a2", "Acme", "2026-08-10T00:00:00Z", notes({ title: "Acme call 2" })),
  ])[0]!;
  const ev = collectCompanyEvidence(group);

  it("builds an llm summary through an injected chat", async () => {
    const summary = await generateDealSummary(ev, {
      now: NOW,
      chat: async () =>
        JSON.stringify({
          headline: "Two calls in, demo booked.",
          narrative: [{ text: "Started with routing pain", refs: ["c1"] }],
          resolved: [],
          open: [{ text: "Demo Thursday", refs: ["c2"] }],
          risks: [],
        }),
    });
    assert.equal(summary.generator, "llm");
    assert.equal(summary.callCount, 2);
    assert.equal(summary.open.length, 1);
    assert.ok(Object.keys(summary.receipts).length >= 2);
  });

  it("falls back to deterministic when the chat throws", async () => {
    const summary = await generateDealSummary(ev, {
      now: NOW,
      chat: async () => {
        throw new Error("provider down");
      },
    });
    assert.equal(summary.generator, "deterministic");
    assert.ok(summary.narrative.length >= 1);
    assert.ok(summary.headline.includes("2 calls"));
  });

  it("deterministic summary carries the latest call's open items", () => {
    const summary = deterministicDealSummary(ev, NOW);
    assert.equal(summary.generator, "deterministic");
    assert.ok(summary.open.some((item) => item.text.includes("Demo Thursday")));
    for (const item of [...summary.narrative, ...summary.open]) {
      for (const ref of item.refs) assert.ok(summary.receipts[ref]);
    }
  });
});

describe("dealSummaryInputsHash", () => {
  const a = run("a", "Acme", "2026-08-01T00:00:00Z", notes());
  const b = run("b", "Acme", "2026-08-10T00:00:00Z", notes());

  it("is order-insensitive and change-sensitive", () => {
    assert.equal(
      dealSummaryInputsHash([a, b], "llm"),
      dealSummaryInputsHash([b, a], "llm"),
    );
    assert.notEqual(
      dealSummaryInputsHash([a, b], "llm"),
      dealSummaryInputsHash([a], "llm"),
    );
    assert.notEqual(
      dealSummaryInputsHash([a, b], "llm"),
      dealSummaryInputsHash([a, { ...b, updatedAt: NOW }], "llm"),
    );
    assert.notEqual(
      dealSummaryInputsHash([a, b], "llm"),
      dealSummaryInputsHash([a, b], "deterministic"),
    );
  });
});
