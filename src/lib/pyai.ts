import { randomUUID } from "crypto";
import { preferredLanguage } from "@/lib/settings";
import { config, hasLivePyai } from "@/lib/config";
import {
  hearResultToTranscript,
  transcriptToUtterances,
  type HearJobResult,
  type RecapUtterance,
} from "@/lib/hear-speakers";
import { prepareAudioForHear } from "@/lib/prepare-hear-audio";
import {
  canRemintSandbox,
  isSandboxKey,
  remintSandboxKey,
} from "@/lib/pyai-key";
import { TranscriptLine } from "@/lib/types";

export class PyAiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/** Short Retry-After = throttle; missing/long = sandbox daily cap. */
export function classify429(retryAfter: string | null): {
  action: "retry" | "daily_cap";
  waitMs?: number;
} {
  let seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) && retryAfter) {
    const when = Date.parse(retryAfter);
    if (!Number.isNaN(when)) seconds = Math.ceil((when - Date.now()) / 1000);
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) {
    return { action: "daily_cap" };
  }
  return {
    action: "retry",
    waitMs: seconds * 1000 + Math.floor(Math.random() * 250),
  };
}

export function pyaiUserMessage(error: unknown): {
  message: string;
  status: number;
  code?: string;
} {
  if (error instanceof PyAiError) {
    if (error.code === "PYAI_DAILY_CAP") {
      return { message: error.message, status: 429, code: error.code };
    }
    if (error.code === "PYAI_AUTH_FAILED") {
      return { message: error.message, status: 401, code: error.code };
    }
    return { message: error.message, status: 502, code: error.code };
  }
  const message =
    error instanceof Error ? error.message : "PyAI request failed";
  if (/\(413\)|entity too large/i.test(message)) {
    return {
      message:
        "Hear rejected this upload as too large (413). Export an audio-only MP3 under ~18MB, or retry — large webm/mp4 meeting files are compressed automatically when ffmpeg is available.",
      status: 413,
      code: "HEAR_UPLOAD_TOO_LARGE",
    };
  }
  return { message, status: 500 };
}

export type {
  HearJobResult,
  HearSegment,
  HearWord,
  RecapUtterance,
} from "@/lib/hear-speakers";
export {
  hearResultToTranscript,
  segmentsToTranscript,
  speakerKey,
  speakerTurnsFromResult,
  transcriptToUtterances,
  wordsToSegments,
} from "@/lib/hear-speakers";

export type RecapCall = {
  object?: string;
  call_id: string;
  pack_id?: string;
  status: "pending" | "processing" | "complete" | "failed";
  headline?: string | null;
  customer_name?: string | null;
  error?: string | null;
  transcript?: { format?: string; utterances?: RecapUtterance[] };
  record?: Record<string, unknown> | null;
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pyaiFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  let remintsLeft = canRemintSandbox() ? 1 : 0;
  let retries429 = 2;

  while (true) {
    if (!config.pyaiApiKey) {
      throw new PyAiError(
        "PYAI_AUTH_FAILED",
        "No PyAI key. Set PYAI_API_KEY or enable sandbox auto-mint.",
      );
    }

    const headers = new Headers(init.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${config.pyaiApiKey}`);
    }

    const response = await fetch(`${config.pyaiBaseUrl}${pathname}`, {
      ...init,
      headers,
    });

    if (
      response.status === 401 &&
      remintsLeft > 0 &&
      isSandboxKey(config.pyaiApiKey)
    ) {
      remintsLeft -= 1;
      await remintSandboxKey();
      continue;
    }

    if (response.status === 401) {
      throw new PyAiError(
        "PYAI_AUTH_FAILED",
        "PyAI key rejected. Set a live PYAI_API_KEY or wait for sandbox remint.",
      );
    }

    if (response.status === 429) {
      const verdict = classify429(response.headers.get("retry-after"));
      if (verdict.action === "retry" && retries429 > 0 && verdict.waitMs) {
        retries429 -= 1;
        await sleep(verdict.waitMs);
        continue;
      }
      throw new PyAiError(
        "PYAI_DAILY_CAP",
        "PyAI sandbox daily cap reached — resets daily. Samples still work offline.",
      );
    }

    return response;
  }
}

async function pyaiJson<T>(
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await pyaiFetch(pathname, init);
  if (!response.ok) {
    throw new PyAiError(
      "PYAI_REQUEST_FAILED",
      `PyAI ${pathname} failed (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

async function loadJobResult(job: {
  result?: HearJobResult;
  result_url?: string;
}): Promise<HearJobResult> {
  if (job.result_url) {
    const response = await fetch(job.result_url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch result_url (${response.status})`);
    }
    return (await response.json()) as HearJobResult;
  }
  if (job.result) return job.result;
  throw new Error("Transcription job completed without result");
}

export async function pollTranscriptionJob(
  jobId: string,
  timeoutMs = 90_000,
): Promise<HearJobResult> {
  const deadline = Date.now() + timeoutMs;
  let delay = 800;
  while (Date.now() < deadline) {
    const job = await pyaiJson<{
      job_id: string;
      status: string;
      error?: string;
      result?: HearJobResult;
      result_url?: string;
    }>(`/transcription/jobs/${jobId}`);

    if (job.status === "completed") {
      return loadJobResult(job);
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || `Transcription job ${job.status}`);
    }
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.4), 2_000);
  }
  throw new Error(`Transcription job timed out: ${jobId}`);
}

export type HearJobMode = {
  /** Stereo dual-channel split. Mutually exclusive with diarize. */
  channel: boolean;
  diarize: boolean;
  model: string;
};

export function looksStereoSource(name: string | undefined): boolean {
  return /\b(stereo|dual[-_]?chan(?:nel)?|2ch|two[-_]?channel)\b/i.test(
    name || "",
  );
}

export async function detectWavChannels(
  file: File | Blob,
): Promise<number | null> {
  try {
    const buf = Buffer.from(await file.slice(0, 44).arrayBuffer());
    if (buf.length < 24) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
    if (buf.toString("ascii", 8, 4) !== "WAVE") return null;
    return buf.readUInt16LE(22);
  } catch {
    return null;
  }
}

export function chooseHearJobMode(opts: {
  channel?: boolean;
  diarize?: boolean;
  filename?: string;
  audioUrl?: string;
  wavChannels?: number | null;
}): HearJobMode {
  const forceChannel = opts.channel === true || config.channelDefault;
  // WAV header wins: a mono mic capture must not switch to channel mode
  // just because a URL or filename contains the word "stereo".
  const stereo =
    opts.wavChannels === 1
      ? false
      : forceChannel ||
        opts.wavChannels === 2 ||
        looksStereoSource(opts.filename) ||
        looksStereoSource(opts.audioUrl);

  if (stereo) {
    return {
      channel: true,
      diarize: false,
      model: config.hearJobModel,
    };
  }

  const diarize =
    opts.diarize !== false && (opts.diarize === true || config.diarizeDefault);
  return {
    channel: false,
    diarize,
    // Sortformer diarization is on pyai-hear; telephony is for channel split.
    model: diarize ? config.hearModel : config.hearJobModel,
  };
}

function oppositeHearJobMode(mode: HearJobMode): HearJobMode {
  if (mode.channel) {
    return {
      channel: false,
      diarize: true,
      model: config.hearModel,
    };
  }
  return {
    channel: true,
    diarize: false,
    model: config.hearJobModel,
  };
}

export async function createTranscriptionJobFromUrl(opts: {
  audioUrl: string;
  callId: string;
  customerName?: string;
  diarize?: boolean;
  channel?: boolean;
  mode?: HearJobMode;
  idempotencyKey?: string;
}): Promise<{ jobId: string; callId: string }> {
  const mode =
    opts.mode ||
    chooseHearJobMode({
      channel: opts.channel,
      diarize: opts.diarize,
      audioUrl: opts.audioUrl,
    });

  const body: Record<string, unknown> = {
    audio_url: opts.audioUrl,
    model: mode.model,
    numerals: true,
  };
  // Recap is triggered later from mapped speakers — don't send pack_id or
  // call_id here (call_id alone auto-starts Recap from raw Hear segments).
  // Never send channel+diarize together (PyAI treats that as a merged-speaker job).
  if (mode.channel) body.channel = true;
  else if (mode.diarize) body.diarize = true;
  if (opts.customerName) body.customer_name = opts.customerName;

  const response = await pyaiFetch("/transcription/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": opts.idempotencyKey || opts.callId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Create transcription job failed (${response.status}): ${text.slice(0, 320)}`,
    );
  }

  const data = (await response.json()) as { job_id: string };
  return { jobId: data.job_id, callId: opts.callId };
}

export async function createTranscriptionJobFromUpload(opts: {
  file: File | Blob;
  filename: string;
  callId: string;
  customerName?: string;
  mode?: HearJobMode;
  idempotencyKey?: string;
}): Promise<{ jobId: string; callId: string }> {
  const mode =
    opts.mode ||
    chooseHearJobMode({
      filename: opts.filename,
    });

  const form = new FormData();
  form.set("audio", opts.file, opts.filename);
  form.set("model", mode.model);
  if (mode.channel) form.set("channel", "true");
  else if (mode.diarize) form.set("diarize", "true");
  form.set("numerals", "true");
  if (opts.customerName) form.set("customer_name", opts.customerName);

  const response = await pyaiFetch("/transcription/jobs", {
    method: "POST",
    headers: { "Idempotency-Key": opts.idempotencyKey || opts.callId },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Upload transcription job failed (${response.status}): ${text.slice(0, 320)}`,
    );
  }

  const data = (await response.json()) as { job_id: string };
  return { jobId: data.job_id, callId: opts.callId };
}

/** Fast sync Hear path when async jobs are unavailable. */
export async function transcribeAudioSync(
  file: File | Blob,
  filename = "call.webm",
): Promise<TranscriptLine[]> {
  if (!hasLivePyai()) {
    throw new Error("Live transcription requires PYAI_API_KEY");
  }

  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", config.hearModel);
  form.append("response_format", "verbose_json");

  const response = await pyaiFetch("/audio/transcriptions", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Hear sync failed (${response.status}): ${text.slice(0, 320)}`,
    );
  }

  const data = (await response.json()) as HearJobResult;

  const fromResult = hearResultToTranscript(data);
  if (fromResult.length) return fromResult;

  throw new Error("Empty transcript from Hear");
}

export async function ensureRecapEnabled(): Promise<boolean> {
  try {
    const current = await pyaiJson<{ enabled?: boolean }>("/recap/config");
    if (current.enabled) return true;
  } catch {
    // configure scope may be missing
  }

  try {
    const updated = await pyaiJson<{ enabled?: boolean }>("/recap/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        default_pack_id: config.recapPackId,
      }),
    });
    return Boolean(updated.enabled);
  } catch {
    return false;
  }
}

export async function triggerRecap(opts: {
  callId: string;
  transcript: TranscriptLine[];
  customerName?: string;
}): Promise<RecapCall> {
  const utterances = transcriptToUtterances(opts.transcript);
  if (!utterances.length) {
    throw new Error("Cannot trigger Recap with empty transcript");
  }

  const response = await pyaiFetch(`/recap/calls/${opts.callId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack_id: config.recapPackId,
      call_direction: "outbound",
      customer_name: opts.customerName,
      language: preferredLanguage(),
      utterances,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Recap trigger failed (${response.status}): ${text.slice(0, 320)}`,
    );
  }

  return (await response.json()) as RecapCall;
}

export async function getRecap(callId: string): Promise<RecapCall> {
  return pyaiJson<RecapCall>(`/recap/calls/${callId}`);
}

export async function pollRecap(
  callId: string,
  timeoutMs = 90_000,
): Promise<RecapCall> {
  const deadline = Date.now() + timeoutMs;
  let last: RecapCall | null = null;

  while (Date.now() < deadline) {
    try {
      last = await getRecap(callId);
      if (last.status === "complete") return last;
      if (last.status === "failed") {
        throw new Error(last.error || "Recap failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 404 while pending is normal right after job submit
      if (!message.includes("(404)")) throw error;
    }
    await sleep(700);
  }

  throw new Error(
    `Recap timed out for ${callId}${last ? ` (last status: ${last.status})` : ""}`,
  );
}

export async function runHearAndMaybeRecap(opts: {
  mode: "upload" | "url";
  file?: File | Blob;
  filename?: string;
  audioUrl?: string;
  customerName?: string;
  /** @deprecated Sync Hear has no diarization; jobs always run first. */
  preferSync?: boolean;
}): Promise<{
  callId: string;
  transcript: TranscriptLine[];
  recap: RecapCall | null;
  hearPath: "jobs" | "sync";
}> {
  const callId = `og_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  let uploadFile = opts.file;
  let uploadFilename = opts.filename || "call.webm";
  if (opts.mode === "upload" && uploadFile) {
    const prepared = await prepareAudioForHear(uploadFile, uploadFilename);
    uploadFile = prepared.file;
    uploadFilename = prepared.filename;
  }

  async function withRecap(
    transcript: TranscriptLine[],
    hearPath: "jobs" | "sync",
  ) {
    if (!transcript.length) {
      throw new Error("Hear returned empty transcript");
    }
    await ensureRecapEnabled();
    let recap: RecapCall | null = null;
    try {
      await triggerRecap({
        callId,
        transcript,
        customerName: opts.customerName,
      });
      recap = await pollRecap(callId, 12_000);
    } catch {
      recap = null;
    }
    return { callId, transcript, recap, hearPath };
  }

  const wavChannels =
    opts.mode === "upload" && uploadFile
      ? await detectWavChannels(uploadFile)
      : null;
  const mode = chooseHearJobMode({
    filename: uploadFilename,
    audioUrl: opts.audioUrl,
    wavChannels,
  });

  try {
    const created =
      opts.mode === "url" && opts.audioUrl
        ? await createTranscriptionJobFromUrl({
            audioUrl: opts.audioUrl,
            callId,
            customerName: opts.customerName,
            mode,
            idempotencyKey: `${callId}_${mode.channel ? "ch" : "dz"}`,
          })
        : await createTranscriptionJobFromUpload({
            file: uploadFile!,
            filename: uploadFilename,
            callId,
            customerName: opts.customerName,
            mode,
            idempotencyKey: `${callId}_${mode.channel ? "ch" : "dz"}`,
          });

    let result = await pollTranscriptionJob(created.jobId);
    let transcript: TranscriptLine[] = [];
    try {
      transcript = hearResultToTranscript(result);
    } catch {
      transcript = [];
    }
    if (!transcript.length) {
      throw new Error("Hear returned empty transcript");
    }
    const speakers = new Set(transcript.map((line) => line.speaker));
    // Only retry when we chose channel-split (true stereo). Retrying
    // diarize→channel on a mono mic/upload doubles wait time and still
    // returns one speaker.
    const worthRetry = mode.channel || wavChannels === 2;

    if (speakers.size < 2 && worthRetry) {
      const alt = oppositeHearJobMode(mode);
      try {
        const retry =
          opts.mode === "url" && opts.audioUrl
            ? await createTranscriptionJobFromUrl({
                audioUrl: opts.audioUrl,
                callId,
                customerName: opts.customerName,
                mode: alt,
                idempotencyKey: `${callId}_${alt.channel ? "ch" : "dz"}`,
              })
            : await createTranscriptionJobFromUpload({
                file: uploadFile!,
                filename: uploadFilename,
                callId,
                customerName: opts.customerName,
                mode: alt,
                idempotencyKey: `${callId}_${alt.channel ? "ch" : "dz"}`,
              });
        const altResult = await pollTranscriptionJob(retry.jobId);
        const altTranscript = hearResultToTranscript(altResult);
        const altSpeakers = new Set(altTranscript.map((line) => line.speaker));
        if (altSpeakers.size > speakers.size) {
          result = altResult;
          transcript = altTranscript;
        }
      } catch {
        // Keep the first transcript if the other diarization mode fails.
        void result;
      }
    }

    return withRecap(transcript, "jobs");
  } catch (jobError) {
    if (opts.mode !== "upload" || !uploadFile) throw jobError;

    // Fallback: sync Hear when jobs scope is missing or format fails.
    // Sync has no speaker diarization — last resort only.
    try {
      const transcript = await transcribeAudioSync(uploadFile, uploadFilename);
      return withRecap(transcript, "sync");
    } catch (syncError) {
      const jobMsg = jobError instanceof Error ? jobError.message : String(jobError);
      const syncMsg =
        syncError instanceof Error ? syncError.message : String(syncError);
      throw new Error(
        `Hear could not transcribe this recording. Jobs: ${jobMsg.slice(0, 160)} | Sync: ${syncMsg.slice(0, 160)}. Tip: use WAV/MP3, speak clearly for 5+ seconds, or try the scripted live demo.`,
      );
    }
  }
}
