import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  METHODOLOGY_PACKS,
  MethodologyPackSchema,
  DEAL_BANDS,
  resolveDealBand,
  traitsInScope,
  getMethodologyPack,
  applyMethodologyVerdict,
  demoMethodologyScorecard,
  demoScorecardForRun,
  renderMethodologyReport,
  DEMO_METHODOLOGY_VERDICTS,
} from "../src/lib/methodology";
import type { TranscriptLine } from "../src/lib/types";

const brightsmile = JSON.parse(
  readFileSync(new URL("../sample-calls/brightsmile-01-discovery.json", import.meta.url), "utf8"),
) as { transcript: TranscriptLine[] };

describe("methodology packs", () => {
  it("ships 16 packs (14 sales + support + CS), all valid, ids unique", () => {
    assert.equal(METHODOLOGY_PACKS.length, 16);
    const ids = new Set<string>();
    for (const p of METHODOLOGY_PACKS) {
      MethodologyPackSchema.parse(p);
      assert.ok(!ids.has(p.id), `duplicate pack id ${p.id}`);
      ids.add(p.id);
    }
    for (const id of ["meddic", "meddpicc", "sandler", "spin", "spiced", "bant"]) {
      assert.ok(ids.has(id), `missing pack ${id}`);
    }
  });

  it("meddpicc carries the canonical additions", () => {
    const ids = getMethodologyPack("meddpicc")!.traits.map((t) => t.id);
    assert.ok(ids.includes("paper_process"));
    assert.ok(ids.includes("competition"));
    assert.ok(ids.includes("implicate_pain"));
  });
});

describe("deal bands (deal-value-aware scoring)", () => {
  it("resolves value to band; no value means full-methodology scoring", () => {
    assert.equal(resolveDealBand(3_000)?.id, "transactional");
    assert.equal(resolveDealBand(30_000)?.id, "mid");
    assert.equal(resolveDealBand(250_000)?.id, "enterprise");
    assert.equal(resolveDealBand(null), null);
    assert.equal(resolveDealBand(undefined), null);
  });

  it("scopes traits by rigor and never leaves a degenerate denominator", () => {
    const meddic = getMethodologyPack("meddic")!;
    const mid = traitsInScope(meddic, DEAL_BANDS[1]);
    assert.ok(!mid.has("champion"), "champion is deep rigor — out of scope at mid");
    assert.ok(mid.has("identify_pain"));
    // value-selling has zero core traits; transactional must expand, not degenerate.
    const vs = getMethodologyPack("value-selling")!;
    const scoped = traitsInScope(vs, DEAL_BANDS[0]);
    assert.ok(scoped.size >= 3, `expected >=3 scorable traits, got ${scoped.size}`);
  });

  it("a small deal is not dragged down by deep-rigor traits it rightly skipped", () => {
    const demo = DEMO_METHODOLOGY_VERDICTS["brightsmile-01-discovery"];
    const pack = getMethodologyPack(demo.packId)!;
    const enterprise = applyMethodologyVerdict(pack, brightsmile.transcript, demo.verdict, {
      dealValueUsd: 250_000,
    });
    const mid = applyMethodologyVerdict(pack, brightsmile.transcript, demo.verdict, {
      dealValueUsd: demo.dealValueUsd,
    });
    // Same call, same verdicts: at enterprise size the missing champion counts;
    // at mid size it informs without scoring. The misleading-low score is fixed.
    assert.ok(
      mid.score > enterprise.score,
      `mid ${mid.score} should exceed enterprise ${enterprise.score}`,
    );
    const champRow = mid.traits.find((t) => t.trait.id === "champion")!;
    assert.equal(champRow.inScope, false);
    assert.equal(champRow.points, null);
  });
});

describe("evidence gate integration", () => {
  it("verifies real quotes, corrects near-miss line ids, demotes fabrications", () => {
    const card = demoMethodologyScorecard("brightsmile-01-discovery", brightsmile.transcript)!;
    const pain = card.traits.find((t) => t.trait.id === "identify_pain")!.verdict!;
    assert.ok(pain.gatedEvidence.every((e) => e.status !== "uncorroborated"));
    const process = card.traits.find((t) => t.trait.id === "decision_process")!.verdict!;
    assert.equal(process.gatedEvidence[0].status, "uncorroborated", "planted fake quote must demote");
  });

  it("caps unproven mastery at surface", () => {
    const pack = getMethodologyPack("bant")!;
    const card = applyMethodologyVerdict(pack, brightsmile.transcript, {
      callType: "discovery",
      overallNote: "",
      contextFlags: [],
      traits: [
        {
          id: "need",
          depth: "mastery",
          confidence: 0.9,
          evidence: [{ lineId: "L6", quote: "this quote was never said on the call" }],
          gap: "",
        },
      ],
    });
    const need = card.traits.find((t) => t.trait.id === "need")!.verdict!;
    assert.equal(need.unverified, true);
    assert.equal(need.effectiveDepth, "surface");
  });
});

describe("scorecard + report", () => {
  it("demo scorecard renders band note, out-of-scope section, coaching, and flags", () => {
    const card = demoMethodologyScorecard("brightsmile-01-discovery", brightsmile.transcript)!;
    assert.ok(card.score > 0 && card.score <= 100);
    assert.equal(card.band?.id, "mid");
    const report = renderMethodologyReport(card);
    assert.match(report, /Score: \d+\/100/);
    assert.match(report, /Mid-market/);
    assert.match(report, /Not scored at this deal size/);
    assert.match(report, /Champion/);
    assert.match(report, /## Coaching/);
    assert.match(report, /single_threaded/);
    assert.doesNotMatch(report, /we can sign by end of month/, "demoted evidence never renders as proof");
  });

  it("resolves a stored verdict from sampleSlug or sample title", () => {
    const fromSlug = demoScorecardForRun({
      source: "sample",
      sourceLabel: "Brightsmile 1 · Discovery",
      sampleSlug: "brightsmile-01-discovery",
      transcript: brightsmile.transcript,
    });
    assert.ok(fromSlug);
    assert.equal(fromSlug.pack.id, "meddic");

    const fromTitle = demoScorecardForRun(
      {
        source: "sample",
        sourceLabel: "Brightsmile 1 · Discovery",
        transcript: brightsmile.transcript,
      },
      { "Brightsmile 1 · Discovery": "brightsmile-01-discovery" },
    );
    assert.ok(fromTitle);
    assert.equal(fromTitle.score, fromSlug.score);

    const live = demoScorecardForRun({
      source: "live",
      sourceLabel: "Live · Brightsmile 1 · Discovery",
      transcript: brightsmile.transcript,
    });
    assert.equal(live, null);
  });

  it("not_applicable traits leave the denominator", () => {
    const pack = getMethodologyPack("snap")!;
    const traits = pack.traits.map((t, i) => ({
      id: t.id,
      depth: i === 0 ? ("mastery" as const) : ("not_applicable" as const),
      confidence: 0.9,
      evidence: i === 0 ? [{ lineId: "L6", quote: "after hours is the real bleed" }] : [],
      gap: "",
    }));
    const card = applyMethodologyVerdict(pack, brightsmile.transcript, {
      callType: "discovery", overallNote: "", contextFlags: [], traits,
    });
    assert.equal(card.score, 100, "one mastered trait, rest n/a -> 100");
  });
});
