import { randomUUID } from "crypto";
import { config, hasLivePyai } from "@/lib/config";
import { TranscriptLine } from "@/lib/types";

export type HearSegment = {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
  channel?: number;
};

export type HearJobResult = {
  text?: string;
  speakers?: number;
  audio_seconds?: number;
  segments?: HearSegment[];
};

export type RecapUtterance = {
  speaker_role: "agent" | "customer";
  text: string;
  offset_s: number;
  duration_s: number;
};

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
  if (!config.pyaiApiKey) {
    throw new Error("PYAI_API_KEY is not configured");
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${config.pyaiApiKey}`);
  }

  const response = await fetch(`${config.pyaiBaseUrl}${pathname}`, {
    ...init,
    headers,
  });

  return response;
}

async function pyaiJson<T>(
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await pyaiFetch(pathname, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `PyAI ${pathname} failed (${response.status}): ${body.slice(0, 320)}`,
    );
  }
  return (await response.json()) as T;
}

export function segmentsToTranscript(
  segments: HearSegment[],
): TranscriptLine[] {
  return segments
    .map((segment, index) => {
      const text = (segment.text || "").trim();
      const speaker =
        segment.speaker?.trim() ||
        (typeof segment.channel === "number"
          ? `Speaker ${segment.channel}`
          : index % 2 === 0
            ? "Rep"
            : "Prospect");
      return {
        id: `L${index + 1}`,
        index,
        speaker,
        text,
        startMs:
          typeof segment.start === "number"
            ? Math.round(segment.start * 1000)
            : undefined,
        endMs:
          typeof segment.end === "number"
            ? Math.round(segment.end * 1000)
            : undefined,
      };
    })
    .filter((line) => line.text.length > 0);
}

export function transcriptToUtterances(
  transcript: TranscriptLine[],
): RecapUtterance[] {
  return transcript.map((line, index) => {
    const startS = (line.startMs ?? index * 4_000) / 1000;
    const endS =
      (line.endMs ?? (line.startMs ?? index * 4_000) + 3_000) / 1000;
    const role: "agent" | "customer" =
      /rep|agent|seller|ae|speaker 0|ch0/i.test(line.speaker)
        ? "agent"
        : /prospect|customer|buyer|speaker 1|ch1/i.test(line.speaker)
          ? "customer"
          : index % 2 === 0
            ? "agent"
            : "customer";

    return {
      speaker_role: role,
      text: line.text,
      offset_s: Math.max(0, startS),
      duration_s: Math.max(0.4, endS - startS),
    };
  });
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
  timeoutMs = 120_000,
): Promise<HearJobResult> {
  const deadline = Date.now() + timeoutMs;
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
    await sleep(2_500);
  }
  throw new Error(`Transcription job timed out: ${jobId}`);
}

export async function createTranscriptionJobFromUrl(opts: {
  audioUrl: string;
  callId: string;
  customerName?: string;
  diarize?: boolean;
  channel?: boolean;
}): Promise<{ jobId: string; callId: string }> {
  const body = {
    audio_url: opts.audioUrl,
    model: config.hearJobModel,
    diarize: opts.channel ? false : opts.diarize ?? config.diarizeDefault,
    channel: opts.channel ?? config.channelDefault,
    numerals: true,
    output_formats: ["json"],
    call_id: opts.callId,
    pack_id: config.recapPackId,
    call_direction: "outbound" as const,
    customer_name: opts.customerName,
    language: "en" as const,
  };

  const response = await pyaiFetch("/transcription/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": opts.callId,
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
}): Promise<{ jobId: string; callId: string }> {
  const form = new FormData();
  form.append("audio", opts.file, opts.filename);
  form.append("model", config.hearJobModel);
  form.append(
    "diarize",
    config.channelDefault ? "false" : config.diarizeDefault ? "true" : "false",
  );
  form.append("channel", config.channelDefault ? "true" : "false");
  form.append("numerals", "true");
  form.append("output_formats", "json");
  form.append("call_id", opts.callId);
  form.append("pack_id", config.recapPackId);
  form.append("call_direction", "outbound");
  form.append("language", "en");
  if (opts.customerName) form.append("customer_name", opts.customerName);

  const response = await pyaiFetch("/transcription/jobs", {
    method: "POST",
    headers: { "Idempotency-Key": opts.callId },
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

  const data = (await response.json()) as {
    text?: string;
    segments?: HearSegment[];
  };

  if (data.segments?.length) {
    return segmentsToTranscript(data.segments);
  }

  const text = (data.text || "").trim();
  if (!text) throw new Error("Empty transcript from Hear");

  return text.split(/(?<=[.!?])\s+/).map((line, index) => ({
    id: `L${index + 1}`,
    index,
    speaker: index % 2 === 0 ? "Rep" : "Prospect",
    text: line.trim(),
  }));
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
      language: "en",
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
    await sleep(2_000);
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
  /** Prefer sync Hear first (short mic clips / formats jobs mishandle). */
  preferSync?: boolean;
}): Promise<{
  callId: string;
  transcript: TranscriptLine[];
  recap: RecapCall | null;
  hearPath: "jobs" | "sync";
}> {
  const callId = `og_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

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
      if (hearPath === "jobs") {
        try {
          recap = await pollRecap(callId, 45_000);
        } catch {
          await triggerRecap({
            callId,
            transcript,
            customerName: opts.customerName,
          });
          recap = await pollRecap(callId, 60_000);
        }
      } else {
        await triggerRecap({
          callId,
          transcript,
          customerName: opts.customerName,
        });
        recap = await pollRecap(callId, 60_000);
      }
    } catch {
      recap = null;
    }
    return { callId, transcript, recap, hearPath };
  }

  if (opts.preferSync && opts.mode === "upload" && opts.file) {
    try {
      const transcript = await transcribeAudioSync(
        opts.file,
        opts.filename || "call.wav",
      );
      return withRecap(transcript, "sync");
    } catch (syncError) {
      // fall through to jobs
      void syncError;
    }
  }

  try {
    const created =
      opts.mode === "url" && opts.audioUrl
        ? await createTranscriptionJobFromUrl({
            audioUrl: opts.audioUrl,
            callId,
            customerName: opts.customerName,
          })
        : await createTranscriptionJobFromUpload({
            file: opts.file!,
            filename: opts.filename || "call.webm",
            callId,
            customerName: opts.customerName,
          });

    const result = await pollTranscriptionJob(created.jobId);
    const transcript = result.segments?.length
      ? segmentsToTranscript(result.segments)
      : (result.text || "")
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean)
          .map((text, index) => ({
            id: `L${index + 1}`,
            index,
            speaker: index % 2 === 0 ? "Rep" : "Prospect",
            text,
          }));

    return withRecap(transcript, "jobs");
  } catch (jobError) {
    if (opts.mode !== "upload" || !opts.file) throw jobError;

    // Fallback: sync Hear when jobs scope is missing or format fails
    try {
      const transcript = await transcribeAudioSync(
        opts.file,
        opts.filename || "call.wav",
      );
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
