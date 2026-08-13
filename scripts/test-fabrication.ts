/**
 * Fabrication regression set — ported from the opengong-lite base repo's
 * adversarial gate audits (3 rounds). Every case here was a live fabrication
 * path in one of the two codebases at some point tonight; this file keeps
 * them dead. A "fabrication" = a quote or number never spoken reaching
 * status verified/segment_corrected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gateEvidenceQuote, normalizeQuote } from "../src/lib/harness/gates";
import { mapRecapToDealNotes } from "../src/lib/recap-map";
import type { TranscriptLine } from "../src/lib/types";

const T = [
  { id: "l1", index: 0, speaker: "prospect", text: "honestly my main concern is pricing your competitor quoted us almost forty less last week" },
  { id: "l2", index: 1, speaker: "prospect", text: "they quoted 40.15 per seat for the annual plan" },
  { id: "l3", index: 2, speaker: "rep", text: "we will send the compliance packet and the porting proof before your renewal deadline hits" },
  { id: "l4", index: 3, speaker: "rep", text: "we should sync up again soon about this" },
  { id: "l5", index: 4, speaker: "prospect", text: "we should sync up again soon about this" },
] as unknown as TranscriptLine[];

test("empty and whitespace quotes never verify (includes('') is always true)", () => {
  assert.equal(gateEvidenceQuote("", "l1", T).verdict, "uncorroborated");
  assert.equal(gateEvidenceQuote(" ", "l1", T).verdict, "uncorroborated");
  assert.equal(gateEvidenceQuote("\t \n", "l1", T).verdict, "uncorroborated");
});

test("short quotes cannot anchor a claim (min normalized length)", () => {
  assert.equal(gateEvidenceQuote("pricing", "l1", T).verdict, "uncorroborated");
});

test("digit-fusion laundering is dead: '4015' cannot be fabricated from '40.15'", () => {
  assert.equal(normalizeQuote("40.15"), "40 15");
  assert.equal(gateEvidenceQuote("quoted 4015 per seat", "l2", T).verdict, "uncorroborated");
});

test("recall preserved: honestly-punctuated real quotes still verify", () => {
  assert.ok(["match_exact", "match_normalized"].includes(gateEvidenceQuote("quoted 40.15 per seat", "l2", T).verdict));
  assert.equal(gateEvidenceQuote("Almost Forty Less!", "l1", T).verdict, "match_normalized");
});

test("digit-fold refusal still holds: '40' vs spoken 'forty'", () => {
  assert.equal(gateEvidenceQuote("pricing your competitor quoted us almost 40 less", "l1", T).verdict, "uncorroborated");
});

test("rescue ties resolve to uncorroborated, never a guess", () => {
  assert.equal(gateEvidenceQuote("we should sync up again soon about this", "l1", T).verdict, "uncorroborated");
});

test("recap text without a supporting line gets NO manufactured receipt", () => {
  const recap = {
    headline: "Buyer will sign a forty-seat deal on Thursday",
    summary: "Buyer committed to a forty-seat rollout across all regions.",
    next_steps: ["Sign the forty-seat contract on Thursday"],
  } as never;
  const notes = mapRecapToDealNotes(recap, T, "test");
  const all = [
    ...notes.summary, ...notes.objections, ...notes.intent, ...notes.nextSteps,
    ...notes.pain, ...notes.pricing, ...notes.competitors,
  ];
  for (const c of all) {
    const gate = gateEvidenceQuote(c.evidence.quote, c.evidence.lineId, T);
    assert.notEqual(gate.verdict, "match_exact",
      `unsupported recap text must not carry a self-certified receipt: ${JSON.stringify(c.text)}`);
    assert.notEqual(gate.verdict, "match_normalized",
      `unsupported recap text must not carry a self-certified receipt: ${JSON.stringify(c.text)}`);
  }
  const emailGate = gateEvidenceQuote(notes.followUpEmail.evidence.quote, notes.followUpEmail.evidence.lineId, T);
  assert.ok(emailGate.verdict === "uncorroborated" || emailGate.verdict === "missing_line",
    "the recap email pass-through must not carry a manufactured receipt");
  assert.ok(!all.some((c) => c.text.startsWith("Follow up on:")),
    "a next step the buyer never agreed to must not be invented from a transcript line");
});
