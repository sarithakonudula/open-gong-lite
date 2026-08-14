import { spawn } from "child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

/** Stay under common Hear / edge proxy body limits (~25MB). */
export const HEAR_SAFE_UPLOAD_BYTES = 18 * 1024 * 1024;

/**
 * Long-form Hear jobs (~30+ min) often fail with STT 500/503 even when status
 * canaries are green. Empirically ~10–12 min chunks succeed.
 */
export const HEAR_CHUNK_SECONDS = 10 * 60;
/** Don't split when only slightly over the chunk size. */
export const HEAR_CHUNK_SLACK_SECONDS = 90;

function rewriteExt(filename: string, ext: string): string {
  const base = path.basename(filename).replace(/\.[^.]+$/, "") || "call";
  return `${base}${ext}`;
}

export type HearChunkPlan = {
  offsetSec: number;
  durationSec: number;
};

/** Pure planner — used by chunking and unit tests. */
export function hearChunkPlan(
  durationSec: number,
  chunkSec = HEAR_CHUNK_SECONDS,
  slackSec = HEAR_CHUNK_SLACK_SECONDS,
): HearChunkPlan[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [{ offsetSec: 0, durationSec: 0 }];
  }
  if (durationSec <= chunkSec + slackSec) {
    return [{ offsetSec: 0, durationSec }];
  }

  const chunks: HearChunkPlan[] = [];
  for (let offset = 0; offset < durationSec; offset += chunkSec) {
    chunks.push({
      offsetSec: offset,
      durationSec: Math.min(chunkSec, durationSec - offset),
    });
  }

  // Fold a tiny tail into the previous chunk so we don't burn a job on <2 min.
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1]!;
    if (last.durationSec < 120) {
      chunks.pop();
      const prev = chunks[chunks.length - 1]!;
      prev.durationSec += last.durationSec;
    }
  }
  return chunks;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Prefer system ffmpeg; fall back to the bundled ffmpeg-static binary. */
export async function resolveFfmpegPath(): Promise<string | null> {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && (await pathExists(fromEnv))) return fromEnv;

  // PATH first so Alpine/Docker (`apk add ffmpeg`) wins over a glibc-only
  // ffmpeg-static binary that may exist in node_modules but cannot run.
  const onPath = await new Promise<string | null>((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? "ffmpeg" : null));
  });
  if (onPath) return onPath;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundled = require("ffmpeg-static") as string | null;
    if (bundled && (await pathExists(bundled))) return bundled;
  } catch {
    // optional dependency / platform binary missing
  }

  return null;
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4_000) stderr = stderr.slice(-4_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `ffmpeg failed (exit ${code}): ${stderr.slice(-500) || "no stderr"}`,
          ),
        );
      }
    });
  });
}

/** Parse `Duration: HH:MM:SS.ms` from ffmpeg -i stderr. */
export function parseFfmpegDurationSeconds(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

async function probeDurationSeconds(
  bin: string,
  inputPath: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-i", inputPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(parseFfmpegDurationSeconds(stderr)));
  });
}

export type HearAudioChunk = {
  file: File;
  filename: string;
  offsetMs: number;
  durationMs: number;
};

/**
 * Split long prepared audio into Hear-safe chunks. Short files return one part.
 * Requires ffmpeg; if duration cannot be probed, returns the original as a single chunk.
 */
export async function chunkAudioForHear(
  file: File | Blob,
  filename: string,
  chunkSeconds = HEAR_CHUNK_SECONDS,
): Promise<HearAudioChunk[]> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = file.type || "audio/mpeg";
  const single = (): HearAudioChunk[] => [
    {
      file: new File([bytes], filename, { type }),
      filename,
      offsetMs: 0,
      durationMs: 0,
    },
  ];

  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) return single();

  const dir = await mkdtemp(path.join(tmpdir(), "og-hear-chunks-"));
  const inputPath = path.join(dir, "input.bin");

  try {
    await writeFile(inputPath, bytes);
    const durationSec = await probeDurationSeconds(ffmpeg, inputPath);
    if (durationSec == null || durationSec <= 0) return single();

    const plan = hearChunkPlan(durationSec, chunkSeconds);
    if (plan.length <= 1) {
      return [
        {
          file: new File([bytes], filename, { type }),
          filename,
          offsetMs: 0,
          durationMs: Math.round(durationSec * 1000),
        },
      ];
    }

    const chunks: HearAudioChunk[] = [];
    for (let i = 0; i < plan.length; i += 1) {
      const part = plan[i]!;
      const outPath = path.join(dir, `chunk-${i}.mp3`);
      await runFfmpeg(ffmpeg, [
        "-y",
        "-ss",
        String(part.offsetSec),
        "-t",
        String(part.durationSec),
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "32k",
        "-f",
        "mp3",
        outPath,
      ]);
      const mp3 = await readFile(outPath);
      if (mp3.length <= 0) {
        throw new Error(`ffmpeg produced empty chunk ${i + 1}/${plan.length}`);
      }
      if (mp3.length > HEAR_SAFE_UPLOAD_BYTES) {
        throw new Error(
          `Chunk ${i + 1} is still ${(mp3.length / (1024 * 1024)).toFixed(1)}MB (Hear limit ~18MB).`,
        );
      }
      const chunkName = rewriteExt(filename, `.part${i + 1}.mp3`);
      chunks.push({
        file: new File([mp3], chunkName, { type: "audio/mpeg" }),
        filename: chunkName,
        offsetMs: Math.round(part.offsetSec * 1000),
        durationMs: Math.round(part.durationSec * 1000),
      });
    }
    return chunks;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function shouldPrepareForHear(
  byteLength: number,
  filename: string,
  contentType?: string,
): boolean {
  if (byteLength > HEAR_SAFE_UPLOAD_BYTES) return true;
  const lower = filename.toLowerCase();
  const type = (contentType || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  return /\.(webm|mp4|m4v|mov|mkv|ogg|oga)$/i.test(lower);
}

/**
 * Shrink / normalize uploads before Hear. Meeting .webm/.mp4 files often
 * include video and trip Hear's ~25MB proxy with a 413.
 */
export async function prepareAudioForHear(
  file: File | Blob,
  filename: string,
): Promise<{ file: File; filename: string; compressed: boolean }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = file.type || "";

  if (!shouldPrepareForHear(bytes.length, filename, type)) {
    return {
      file: new File([bytes], filename, {
        type: type || "application/octet-stream",
      }),
      filename,
      compressed: false,
    };
  }

  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error(
      "This recording is too large or in a video container for Hear. Install ffmpeg (or set FFMPEG_PATH), or export an audio-only MP3 under ~18MB.",
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "og-hear-"));
  const inputPath = path.join(dir, "input.bin");
  const outputPath = path.join(dir, "out.mp3");

  try {
    await writeFile(inputPath, bytes);
    // Mono 16 kHz / 32 kbps is enough for speech ASR and stays small.
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      "-f",
      "mp3",
      outputPath,
    ]);

    const mp3 = await readFile(outputPath);
    if (mp3.length <= 0) {
      throw new Error("ffmpeg produced an empty MP3");
    }
    if (mp3.length > HEAR_SAFE_UPLOAD_BYTES) {
      throw new Error(
        `Compressed audio is still ${(mp3.length / (1024 * 1024)).toFixed(1)}MB (Hear limit ~18MB). Export a shorter clip or lower-bitrate MP3.`,
      );
    }

    const outName = rewriteExt(filename, ".mp3");
    return {
      file: new File([mp3], outName, { type: "audio/mpeg" }),
      filename: outName,
      compressed: true,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
