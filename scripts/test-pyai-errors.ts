import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseHearJobMode, classify429, looksStereoSource } from "../src/lib/pyai";

describe("classify429", () => {
  it("retries short Retry-After", () => {
    const v = classify429("2");
    assert.equal(v.action, "retry");
    assert.ok((v.waitMs ?? 0) >= 2000);
  });

  it("treats missing or long Retry-After as daily cap", () => {
    assert.equal(classify429(null).action, "daily_cap");
    assert.equal(classify429("3600").action, "daily_cap");
  });
});

describe("hear job mode", () => {
  it("keeps live mic and mp3 on diarize, not channel", () => {
    const mic = chooseHearJobMode({
      filename: "live-mic.wav",
      wavChannels: 1,
    });
    assert.equal(mic.channel, false);
    assert.equal(mic.diarize, true);

    const mp3 = chooseHearJobMode({ filename: "sample_sales_call.mp3" });
    assert.equal(mp3.channel, false);
    assert.equal(mp3.diarize, true);
  });

  it("uses channel only for a true stereo wav header", () => {
    const stereo = chooseHearJobMode({
      filename: "call.wav",
      wavChannels: 2,
    });
    assert.equal(stereo.channel, true);
    assert.equal(stereo.diarize, false);
  });

  it("does not treat a mono wav as stereo just because the name says so", () => {
    const named = chooseHearJobMode({
      filename: "original-stereo-call.wav",
      wavChannels: 1,
    });
    assert.equal(named.channel, false);
    assert.equal(named.diarize, true);
    assert.equal(looksStereoSource("original-stereo-call.wav"), true);
    assert.equal(looksStereoSource("live-mic.wav"), false);
  });
});
