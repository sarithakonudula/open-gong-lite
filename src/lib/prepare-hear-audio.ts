import { spawn } from "child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

/** Stay under common Hear / edge proxy body limits (~25MB). */
export const HEAR_SAFE_UPLOAD_BYTES = 18 * 1024 * 1024;

function rewriteExt(filename: string, ext: string): string {
  const base = path.basename(filename).replace(/\.[^.]+$/, "") || "call";
  return `${base}${ext}`;
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
