/**
 * Fabrication regression set — ported from the opengong-lite base repo's
 * adversarial gate audits (3 rounds). Every case here was a live fabrication
 * path in one of the two codebases at some point tonight; this file keeps
 * them dead. A "fabrication" = a quote or number never spoken reaching
 * status verified/segment_corrected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gateEvidenceQuote, normalizeQuote, validateDealNotes } from "../src/lib/harness/gates";
import { mapRecapToDealNotes } from "../src/lib/recap-map";
import { chokeFollowUp } from "../src/lib/harness/email";
import { demoExtractDealNotes } from "../src/lib/demo-extract";
import type { TranscriptLine } from "../src/lib/types";
import { CONVERSATION_TOPICS, topicEvidence } from "../src/lib/deal-signals";

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
  // The property, not the mechanism: a mark between two digits must survive
  // normalization in some form, so the two numbers can never fuse into one.
  // (Preserving the mark and replacing it with a space both satisfy this.)
  assert.notEqual(normalizeQuote("40.15"), "4015");
  assert.notEqual(normalizeQuote("40.15"), normalizeQuote("4015"));
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

test("email choke: a curated body never ships on the strength of one passing receipt", () => {
  const claims = [
    { id: "c1", text: "prospect said pricing is the main concern", evidence: { lineId: "l1", quote: "my main concern is pricing" }, status: "verified" },
  ] as never[];
  const existing = {
    subject: "Signed deal recap",
    body: "Prospect confirmed budget is approved and agreed to sign a $50k annual contract.",
    evidence: { lineId: "l1", quote: "honestly my main concern is pricing your competitor quoted us almost forty less last week" },
    status: "verified",
  } as never;
  const out = chokeFollowUp({ title: "test", existing, emailStatus: "verified" as never, claims, transcript: T });
  assert.ok(!out.body.includes("$50k"),
    "a Recap-authored body must never ship verbatim, even with a passing envelope receipt");
  assert.ok(out.body.includes("pricing is the main concern"),
    "the shipped email must be composed from gate-passed claims only");
});

test("demo extractor: unmatched patterns are omitted; fallback stays extractive", () => {
  const quiet = [
    { id: "q1", index: 0, speaker: "prospect", text: "thanks for the walkthrough it was clear" },
    { id: "q2", index: 1, speaker: "rep", text: "glad it was useful" },
  ] as unknown as TranscriptLine[];
  const notes = demoExtractDealNotes(quiet, "quiet call");
  const all = [
    ...notes.summary, ...notes.objections, ...notes.intent, ...notes.nextSteps,
    ...notes.pain, ...notes.pricing, ...notes.competitors,
  ];
  assert.equal(all.length, 1, "generic unmatched sections must stay empty");
  assert.equal(all[0]!.text, quiet[0]!.text);
  const gate = gateEvidenceQuote(
    all[0]!.evidence.quote,
    all[0]!.evidence.lineId,
    quiet,
  );
  assert.ok(
    gate.verdict === "match_exact" || gate.verdict === "match_normalized",
    "the one fallback summary must quote the transcript, not invent a label",
  );
});

test("schema altitude: a quiet call ships one grounded summary and empty sections", () => {
  const quiet = [
    { id: "q1", index: 0, speaker: "prospect", text: "thanks for the walkthrough it was clear" },
    { id: "q2", index: 1, speaker: "rep", text: "glad it was useful" },
  ] as unknown as TranscriptLine[];
  const raw = demoExtractDealNotes(quiet, "quiet call");
  const result = validateDealNotes(raw, quiet);
  assert.ok(result.ok,
    `notes must ship with demotions, not fail schema: ${JSON.stringify(!result.ok && result.failures.slice(0,2))}`);
  if (result.ok) {
    const all = [
      ...result.notes.summary, ...result.notes.objections, ...result.notes.intent,
      ...result.notes.nextSteps, ...result.notes.pain, ...result.notes.pricing,
    ];
    assert.equal(all.length, 1);
    assert.equal(all[0]!.status, "verified");
    assert.equal(all[0]!.evidence.lineId, "q1");
  }
});

/**
 * Deal signals (added on main after this branch opened) produce their own
 * receipts. Audited clean: `gatedQuoteFromLine` is the ONLY constructor of a
 * GatedQuote, it slices verbatim from a real transcript line, and it re-runs
 * the same gate. These two probes keep it that way — they are the deal-signals
 * spelling of the bestEvidence disease we closed in recap-map: never hand a
 * signal a receipt it did not earn.
 */
test("deal signals: topic evidence is a verbatim slice that survives the gate", () => {
  const topic = CONVERSATION_TOPICS.find((t) => t.id === "pricing")!;
  const evidence = topicEvidence(topic, T);
  assert.ok(evidence.length > 0, "pricing is discussed on this transcript");
  for (const e of evidence) {
    const line = T.find((l) => l.id === e.lineId);
    assert.ok(line, `evidence must point at a real line, got ${e.lineId}`);
    assert.ok(line!.text.includes(e.quote),
      `quote must be a verbatim slice of its own line, not a paraphrase: ${JSON.stringify(e.quote)}`);
    assert.notEqual(e.status, "uncorroborated",
      "uncorroborated evidence must be dropped, never shown as a receipt");
    const regated = gateEvidenceQuote(e.quote, e.lineId, T);
    assert.ok(regated.verdict !== "uncorroborated" && regated.verdict !== "missing_line",
      "a shown signal receipt must still pass the gate on a re-run");
  }
});

test("deal signals: a topic with no backing line yields NO evidence, not a manufactured one", () => {
  const topic = CONVERSATION_TOPICS.find((t) => t.id === "pricing")!;
  const silent = [
    { id: "s1", index: 0, speaker: "rep", text: "thanks for making the time today it was good to meet the team" },
    { id: "s2", index: 1, speaker: "prospect", text: "likewise we will talk internally and circle back to you" },
  ] as unknown as TranscriptLine[];
  assert.deepEqual(topicEvidence(topic, silent), [],
    "no line discusses this topic, so the signal must stand alone rather than borrow a receipt");
});
