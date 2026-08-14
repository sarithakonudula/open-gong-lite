import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEAR_SAFE_UPLOAD_BYTES,
  shouldPrepareForHear,
} from "../src/lib/prepare-hear-audio";

describe("shouldPrepareForHear", () => {
  it("compresses large files regardless of extension", () => {
    assert.equal(
      shouldPrepareForHear(HEAR_SAFE_UPLOAD_BYTES + 1, "call.mp3", "audio/mpeg"),
      true,
    );
  });

  it("compresses webm/mp4 containers even when small", () => {
    assert.equal(
      shouldPrepareForHear(1024, "meeting.webm", "video/webm"),
      true,
    );
    assert.equal(shouldPrepareForHear(1024, "clip.mp4", "video/mp4"), true);
  });

  it("passes through small audio mp3/wav", () => {
    assert.equal(
      shouldPrepareForHear(1024, "call.mp3", "audio/mpeg"),
      false,
    );
    assert.equal(shouldPrepareForHear(1024, "call.wav", "audio/wav"), false);
  });
});
