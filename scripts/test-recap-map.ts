import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locateEvidence, mapRecapToDealNotes } from "../src/lib/recap-map";
import type { RecapCall } from "../src/lib/pyai";
import type { TranscriptLine } from "../src/lib/types";

const transcript: TranscriptLine[] = [
  {
    id: "L1",
    index: 0,
    speaker: "Rep",
    text: "Thanks for jumping on, Rahul. Last time you mentioned RingHawk dropping after-hours bookings.",
  },
  {
    id: "L2",
    index: 1,
    speaker: "Prospect",
    text: "Yes. We lose about ten bookings a week. We do not have a budget problem — it's a trust problem.",
  },
];

describe("locateEvidence", () => {
  it("uses the claim text as the quote, never the line text", () => {
    const evidence = locateEvidence(
      "RingHawk dropping after-hours bookings",
      transcript,
    );
    assert.equal(evidence.lineId, "L1");
    assert.equal(evidence.quote, "RingHawk dropping after-hours bookings");
    assert.notEqual(evidence.quote, transcript[0]!.text);
  });

  it("does not invent a matching quote for an unsupported claim", () => {
    const evidence = locateEvidence(
      "Buyer agreed to a forty percent discount today.",
      transcript,
    );
    assert.equal(
      evidence.quote,
      "Buyer agreed to a forty percent discount today.",
    );
  });

  it("refuses an empty transcript", () => {
    assert.throws(() => locateEvidence("anything", []), /empty transcript/);
  });
});

describe("mapRecapToDealNotes", () => {
  it("does not invent next steps when Recap is empty", () => {
    const recap = {
      call_id: "c1",
      status: "complete",
      headline: "Quiet wrap-up",
      record: {},
    } as RecapCall;
    const notes = mapRecapToDealNotes(recap, transcript, "Quiet wrap-up");
    assert.ok(
      notes.nextSteps[0]!.text.toLowerCase().includes("not stated"),
    );
    assert.equal(
      notes.followUpEmail.body.includes("Follow up on:"),
      false,
    );
  });

  it("refuses to map onto zero lines", () => {
    const recap = {
      call_id: "c1",
      status: "complete",
      record: {},
    } as RecapCall;
    assert.throws(() => mapRecapToDealNotes(recap, []), /empty transcript/);
  });
});
