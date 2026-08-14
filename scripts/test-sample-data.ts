import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCallKind } from "../src/lib/call-kind";
import { validateDealNotes } from "../src/lib/harness/gates";
import { computeMomentum } from "../src/lib/momentum";
import {
  buildSampleCall,
  SAMPLE_COMPANIES,
  SAMPLE_SLUG_PREFIX,
  sampleSlugFor,
} from "../src/lib/sample-data";

describe("sample dataset", () => {
  it("ships 20 unique companies across the stage mix", () => {
    assert.equal(SAMPLE_COMPANIES.length, 20);
    assert.equal(new Set(SAMPLE_COMPANIES.map((s) => s.company)).size, 20);
    assert.equal(new Set(SAMPLE_COMPANIES.map((s) => s.slug)).size, 20);
    const count = (stage: string) =>
      SAMPLE_COMPANIES.filter((s) => s.stage === stage).length;
    assert.equal(count("advancing"), 6);
    assert.equal(count("steady"), 5);
    assert.equal(count("at_risk"), 4);
    assert.equal(count("support"), 2);
    assert.equal(count("customer_success"), 3);
    assert.equal(SAMPLE_COMPANIES.filter((s) => s.featured).length, 10);
    for (const spec of SAMPLE_COMPANIES) {
      assert.ok(sampleSlugFor(spec).startsWith(SAMPLE_SLUG_PREFIX));
    }
  });

  it("every generated call passes the REAL evidence gates", () => {
    for (const spec of SAMPLE_COMPANIES) {
      const { transcript, notes } = buildSampleCall(spec);
      const gate = validateDealNotes(notes, transcript);
      assert.ok(gate.ok, `${spec.slug}: gate failed ${JSON.stringify(!gate.ok && gate.failures?.slice(0, 2))}`);
      if (!gate.ok) continue;
      // Everything except the at-risk calls' deliberate unbackable claims
      // must come through verified.
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
    for (const spec of SAMPLE_COMPANIES) {
      if (spec.stage === "support" || spec.stage === "customer_success") continue;
      const { transcript, notes } = buildSampleCall(spec);
      const gate = validateDealNotes(notes, transcript);
      assert.ok(gate.ok);
      const direction = computeMomentum(gate.notes).direction;
      assert.equal(direction, spec.stage, `${spec.slug}: ${direction} != ${spec.stage}`);
    }
  });

  it("support and CS calls are detected as their kind", () => {
    for (const spec of SAMPLE_COMPANIES) {
      if (spec.stage !== "support" && spec.stage !== "customer_success") continue;
      const { transcript } = buildSampleCall(spec);
      assert.equal(detectCallKind(transcript).kind, spec.stage, spec.slug);
    }
  });

  it("sales sample calls are detected as sales, not support/CS", () => {
    for (const spec of SAMPLE_COMPANIES) {
      if (spec.stage === "support" || spec.stage === "customer_success") continue;
      const { transcript } = buildSampleCall(spec);
      assert.equal(detectCallKind(transcript).kind, "sales", spec.slug);
    }
  });
});
