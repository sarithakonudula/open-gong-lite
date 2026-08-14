import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEAR_CHUNK_SECONDS,
  HEAR_SAFE_UPLOAD_BYTES,
  hearChunkPlan,
  parseFfmpegDurationSeconds,
  shouldPrepareForHear,
} from "../src/lib/prepare-hear-audio";
import {
  hearJobPollTimeoutMs,
  mergeChunkTranscripts,
} from "../src/lib/pyai";

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

describe("hearChunkPlan", () => {
  it("keeps short calls as a single chunk", () => {
    assert.deepEqual(hearChunkPlan(90), [{ offsetSec: 0, durationSec: 90 }]);
    assert.deepEqual(hearChunkPlan(HEAR_CHUNK_SECONDS + 60), [
      { offsetSec: 0, durationSec: HEAR_CHUNK_SECONDS + 60 },
    ]);
  });

  it("splits a 37-minute call into ~10-minute parts", () => {
    const plan = hearChunkPlan(36 * 60 + 47);
    assert.equal(plan.length, 4);
    assert.equal(plan[0]?.offsetSec, 0);
    assert.equal(plan[0]?.durationSec, HEAR_CHUNK_SECONDS);
    assert.equal(plan[1]?.offsetSec, HEAR_CHUNK_SECONDS);
    assert.equal(
      plan.reduce((sum, part) => sum + part.durationSec, 0),
      36 * 60 + 47,
    );
  });

  it("folds a tiny tail into the previous chunk", () => {
    const plan = hearChunkPlan(HEAR_CHUNK_SECONDS * 2 + 60, HEAR_CHUNK_SECONDS, 0);
    assert.equal(plan.length, 2);
    assert.equal(plan[0]?.durationSec, HEAR_CHUNK_SECONDS);
    assert.equal(plan[1]?.durationSec, HEAR_CHUNK_SECONDS + 60);
  });
});

describe("parseFfmpegDurationSeconds", () => {
  it("parses ffmpeg Duration lines", () => {
    assert.equal(
      parseFfmpegDurationSeconds("  Duration: 00:36:47.45, start: 0.000000"),
      36 * 60 + 47.45,
    );
  });
});

describe("mergeChunkTranscripts", () => {
  it("offsets timestamps and reindexes ids", () => {
    const merged = mergeChunkTranscripts([
      {
        offsetMs: 0,
        lines: [
          {
            id: "L1",
            index: 0,
            speaker: "Rep",
            text: "hello",
            startMs: 1000,
            endMs: 2000,
          },
        ],
      },
      {
        offsetMs: 600_000,
        lines: [
          {
            id: "L1",
            index: 0,
            speaker: "Prospect",
            text: "hi",
            startMs: 500,
            endMs: 1500,
          },
        ],
      },
    ]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.id, "L1");
    assert.equal(merged[1]?.id, "L2");
    assert.equal(merged[1]?.startMs, 600_500);
    assert.equal(merged[1]?.endMs, 601_500);
  });
});

describe("hearJobPollTimeoutMs", () => {
  it("scales with duration and stays bounded", () => {
    assert.equal(hearJobPollTimeoutMs(60_000), 120_000);
    assert.ok(hearJobPollTimeoutMs(10 * 60_000) >= 120_000);
    assert.equal(hearJobPollTimeoutMs(60 * 60_000), 480_000);
  });
});
