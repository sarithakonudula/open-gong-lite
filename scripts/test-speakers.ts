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
          text: "april thanks for hopping on good i'm sam",
          start: 0,
          end: 8,
        },
      ],
      words: [
        { word: "april", speaker: "speaker_1", start: 0, end: 0.4 },
        { word: "thanks", speaker: "speaker_1", start: 0.4, end: 0.7 },
        { word: "for", speaker: "speaker_1", start: 0.7, end: 0.9 },
        { word: "hopping", speaker: "speaker_1", start: 0.9, end: 1.3 },
        { word: "on", speaker: "speaker_1", start: 1.3, end: 1.5 },
        { word: "good", speaker: "speaker_2", start: 1.8, end: 2.1 },
        { word: "i'm", speaker: "speaker_2", start: 2.1, end: 2.3 },
        { word: "sam", speaker: "speaker_2", start: 2.3, end: 2.6 },
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
  });
});
