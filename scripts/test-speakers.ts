import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hearResultToTranscript,
  speakerKey,
  transcriptToUtterances,
} from "../src/lib/hear-speakers";

describe("speaker mapping", () => {
  it("maps first-seen speaker_1 / speaker_2 to Rep / Prospect", () => {
    const transcript = hearResultToTranscript({
      segments: [
        { speaker: "speaker_1", text: "thanks for jumping on", start: 0, end: 2 },
        { speaker: "speaker_2", text: "pricing is a stretch", start: 2.1, end: 4 },
        { speaker: "speaker_1", text: "we can start a pilot", start: 4.2, end: 6 },
      ],
    });
    assert.deepEqual(
      transcript.map((line) => line.speaker),
      ["Rep", "Prospect", "Rep"],
    );
  });

  it("splits collapsed segments using word-level speakers", () => {
    const transcript = hearResultToTranscript({
      segments: [
        {
          speaker: "speaker_1",
          channel: 0,
          text: "april thanks for hopping on good i'm sam",
          start: 0,
          end: 8,
        },
      ],
      words: [
        { word: "april", speaker: "speaker_1", channel: 0, start: 0, end: 0.4 },
        { word: "thanks", speaker: "speaker_1", channel: 0, start: 0.4, end: 0.7 },
        { word: "for", speaker: "speaker_1", channel: 0, start: 0.7, end: 0.9 },
        { word: "hopping", speaker: "speaker_1", channel: 0, start: 0.9, end: 1.3 },
        { word: "on", speaker: "speaker_1", channel: 0, start: 1.3, end: 1.5 },
        { word: "good", speaker: "speaker_2", channel: 0, start: 1.8, end: 2.1 },
        { word: "i'm", speaker: "speaker_2", channel: 0, start: 2.1, end: 2.3 },
        { word: "sam", speaker: "speaker_2", channel: 0, start: 2.3, end: 2.6 },
      ],
    });
    assert.equal(transcript.length, 2);
    assert.equal(transcript[0]?.speaker, "Rep");
    assert.equal(transcript[1]?.speaker, "Prospect");
    assert.match(transcript[0]?.text || "", /april thanks/);
    assert.match(transcript[1]?.text || "", /sam/);
  });

  it("treats stereo channels as distinct speakers", () => {
    const transcript = hearResultToTranscript({
      segments: [
        { channel: 0, text: "hello from channel zero", start: 0, end: 1 },
        { channel: 1, text: "hello from channel one", start: 1.1, end: 2 },
      ],
    });
    assert.deepEqual(
      transcript.map((line) => line.speaker),
      ["Rep", "Prospect"],
    );
  });

  it("does not merge diarized speakers that share mono channel 0", () => {
    const transcript = hearResultToTranscript({
      segments: [
        {
          speaker: "speaker_1",
          channel: 0,
          text: "thanks for jumping on",
          start: 0,
          end: 2,
        },
        {
          speaker: "speaker_2",
          channel: 0,
          text: "pricing is a stretch",
          start: 2.1,
          end: 4,
        },
        {
          speaker: "speaker_1",
          channel: 0,
          text: "we can start a pilot",
          start: 4.2,
          end: 6,
        },
      ],
    });
    assert.deepEqual(
      transcript.map((line) => line.speaker),
      ["Rep", "Prospect", "Rep"],
    );
  });

  it("still splits stereo when both channels reuse speaker_1", () => {
    const transcript = hearResultToTranscript({
      segments: [
        { speaker: "speaker_1", channel: 0, text: "rep side", start: 0, end: 1 },
        { speaker: "speaker_1", channel: 1, text: "buyer side", start: 1.1, end: 2 },
      ],
    });
    assert.deepEqual(
      transcript.map((line) => line.speaker),
      ["Rep", "Prospect"],
    );
  });

  it("maps Rep/Prospect to Recap agent/customer roles", () => {
    const utterances = transcriptToUtterances([
      { id: "L1", index: 0, speaker: "Rep", text: "Let's start." },
      { id: "L2", index: 1, speaker: "Prospect", text: "Send the pilot." },
    ]);
    assert.equal(utterances[0]?.speaker_role, "agent");
    assert.equal(utterances[1]?.speaker_role, "customer");
  });

  it("normalizes speaker_0 and speaker 0 to the same key", () => {
    assert.equal(speakerKey({ speaker: "speaker_0" }), "spk:0");
    assert.equal(speakerKey({ speaker: "Speaker 0" }), "spk:0");
    assert.equal(speakerKey({ speaker: "ch1" }), "spk:1");
    assert.equal(speakerKey({ channel: 1 }), "ch:1");
    assert.equal(
      speakerKey({ speaker: "speaker_1", channel: 0 }),
      "spk:1",
      "mono channel must not wipe the diarize label",
    );
    assert.equal(speakerKey({ speaker: 0 }), "spk:0", "numeric 0 is a speaker");
    assert.equal(speakerKey({ speaker: 1 }), "spk:1");
  });

  it("splits numeric speaker 0 / 1 instead of collapsing onto one label", () => {
    const transcript = hearResultToTranscript({
      segments: [
        { speaker: 0, text: "hello from the rep", start: 0, end: 1 },
        { speaker: 1, text: "hello from the buyer", start: 1.1, end: 2 },
        { speaker: 0, text: "let's book a demo", start: 2.2, end: 3 },
      ],
    });
    assert.deepEqual(
      transcript.map((line) => line.speaker),
      ["Rep", "Prospect", "Rep"],
    );
  });

  it("uses numeric word-level speakers when the segment is one blob", () => {
    const transcript = hearResultToTranscript({
      speakers: 2,
      segments: [
        {
          speaker: 0,
          text: "hello hi how are you doing hey yes everything is fine",
          start: 0,
          end: 4,
        },
      ],
      words: [
        { word: "hello", speaker: 0, start: 0, end: 0.3 },
        { word: "hi", speaker: 0, start: 0.3, end: 0.5 },
        { word: "how", speaker: 0, start: 0.5, end: 0.7 },
        { word: "are", speaker: 0, start: 0.7, end: 0.9 },
        { word: "you", speaker: 0, start: 0.9, end: 1.1 },
        { word: "doing", speaker: 0, start: 1.1, end: 1.4 },
        { word: "hey", speaker: 1, start: 1.6, end: 1.8 },
        { word: "yes", speaker: 1, start: 1.8, end: 2.0 },
        { word: "everything", speaker: 1, start: 2.0, end: 2.4 },
        { word: "is", speaker: 1, start: 2.4, end: 2.5 },
        { word: "fine", speaker: 1, start: 2.5, end: 2.8 },
      ],
    });
    assert.equal(transcript.length, 2);
    assert.equal(transcript[0]?.speaker, "Rep");
    assert.equal(transcript[1]?.speaker, "Prospect");
    assert.match(transcript[0]?.text || "", /hello/);
    assert.match(transcript[1]?.text || "", /fine/);
  });
});
