import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCallKind } from "../src/lib/call-kind";
import { validateDealNotes } from "../src/lib/harness/gates";
import { computeMomentum } from "../src/lib/momentum";
import {
  buildSampleCall,
  SAMPLE_CALLS,
  SAMPLE_DATASET,
  SAMPLE_SLUG_PREFIX,
  sampleMethodologyFor,
  sampleSignalFeedFor,
  sampleSlugFor,
} from "../src/lib/sample-data";

describe("sample dataset", () => {
  it("ships 24 companies and 42 calls in the requested mix", () => {
    assert.equal(SAMPLE_CALLS.length, SAMPLE_DATASET.calls);
    assert.equal(SAMPLE_CALLS.length, 42);
    assert.equal(new Set(SAMPLE_CALLS.map((s) => s.company)).size, 24);
    assert.equal(new Set(SAMPLE_CALLS.map((s) => s.slug)).size, 42);
    const count = (stage: string) =>
      SAMPLE_CALLS.filter((s) => s.stage === stage).length;
    assert.equal(
      count("advancing") + count("steady") + count("at_risk"),
      SAMPLE_DATASET.sales,
    );
    assert.equal(count("customer_success"), SAMPLE_DATASET.customerSuccess);
    assert.equal(count("support"), SAMPLE_DATASET.support);
    assert.equal(SAMPLE_DATASET.sales, 17);
    assert.equal(SAMPLE_DATASET.customerSuccess, 14);
    assert.equal(SAMPLE_DATASET.support, 11);
    for (const spec of SAMPLE_CALLS) {
      assert.ok(sampleSlugFor(spec).startsWith(SAMPLE_SLUG_PREFIX));
      assert.ok(sampleSlugFor(spec).length <= 80);
    }
  });

  it("every generated call passes the REAL evidence gates", () => {
    for (const spec of SAMPLE_CALLS) {
      const { transcript, notes } = buildSampleCall(spec);
      const gate = validateDealNotes(notes, transcript);
      assert.ok(gate.ok, `${spec.slug}: gate failed ${JSON.stringify(!gate.ok && gate.failures?.slice(0, 2))}`);
      if (!gate.ok) continue;
      const gated = gate.notes;
      const summaryStatuses = gated.summary.map((c) => c.status);
      assert.ok(
        summaryStatuses.every((s) => s === "verified" || s === "segment_corrected"),
        `${spec.slug}: summary not verified: ${summaryStatuses}`,
      );
      if (spec.stage === "at_risk") {
        assert.equal(gated.nextSteps[0]!.status, "uncorroborated", `${spec.slug}: at-risk next step should demote`);
      } else {
        assert.ok(
          gated.nextSteps.some((c) => c.status === "verified" || c.status === "segment_corrected"),
          `${spec.slug}: expected a verified next step`,
        );
      }
    }
  });

  it("sales calls land on their target momentum stage after gating", () => {
    for (const spec of SAMPLE_CALLS) {
      if (spec.stage === "support" || spec.stage === "customer_success") continue;
      const { transcript, notes } = buildSampleCall(spec);
      const gate = validateDealNotes(notes, transcript);
      assert.ok(gate.ok);
      const direction = computeMomentum(gate.notes).direction;
      assert.equal(direction, spec.stage, `${spec.slug}: ${direction} != ${spec.stage}`);
    }
  });

  it("support and CS calls are detected as their kind", () => {
    for (const spec of SAMPLE_CALLS) {
      if (spec.stage !== "support" && spec.stage !== "customer_success") continue;
      const { transcript } = buildSampleCall(spec);
      assert.equal(detectCallKind(transcript).kind, spec.stage, spec.slug);
    }
  });

  it("sales sample calls are detected as sales, not support/CS", () => {
    for (const spec of SAMPLE_CALLS) {
      if (spec.stage === "support" || spec.stage === "customer_success") continue;
      const { transcript } = buildSampleCall(spec);
      assert.equal(detectCallKind(transcript).kind, "sales", spec.slug);
    }
  });

  it("methodology verdicts re-gate on the generated transcript", () => {
    for (const spec of SAMPLE_CALLS) {
      const { transcript } = buildSampleCall(spec);
      const { card } = sampleMethodologyFor(spec, transcript);
      assert.ok(card.score >= 0 && card.score <= 100, spec.slug);
      assert.equal(
        card.evidenceStats.unverifiedTraits,
        0,
        `${spec.slug}: unverified traits ${card.evidenceStats.unverifiedTraits}`,
      );
    }
  });

  it("every call ships a deal-signal feed", () => {
    for (const spec of SAMPLE_CALLS) {
      const { transcript } = buildSampleCall(spec);
      const feed = sampleSignalFeedFor(spec, transcript);
      assert.equal(feed.company, spec.company);
      assert.ok(feed.alerts.length > 0, `${spec.slug}: expected alerts`);
    }
  });
});
