import { TranscriptLine } from "./types";

export type HearWord = {
  word?: string;
  text?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  speaker?: string | number;
  channel?: number;
  speaker_id?: string | number;
};

export type HearSegment = {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string | number;
  channel?: number;
  words?: HearWord[];
  speaker_id?: string | number;
};

export type HearJobResult = {
  text?: string;
  speakers?: number;
  audio_seconds?: number;
  segments?: HearSegment[];
  words?: HearWord[];
};

export type RecapUtterance = {
  speaker_role: "agent" | "customer";
  text: string;
  offset_s: number;
  duration_s: number;
};

const ROLE_LABELS = ["Rep", "Prospect"] as const;

type IdentityMode = "speaker" | "channel";

/** Hear uses `speaker_0` strings *or* numeric 0/1. `0` is falsy in JS. */
function coerceSpeakerLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `speaker_${value}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d+$/.test(trimmed)) return `speaker_${trimmed}`;
    return trimmed;
  }
  return "";
}

function readSpeaker(
  part: Pick<HearSegment, "speaker" | "speaker_id" | "channel">,
): string {
  const rec = part as Record<string, unknown>;
  return (
    coerceSpeakerLabel(part.speaker) ||
    coerceSpeakerLabel(part.speaker_id) ||
    coerceSpeakerLabel(rec.speakerId) ||
    coerceSpeakerLabel(rec.spk)
  );
}

function speakerLabelKey(
  part: Pick<HearSegment, "speaker" | "speaker_id" | "channel">,
): string {
  const raw = readSpeaker(part);
  if (!raw) return "";
  const numbered = raw.match(/(?:speaker|ch(?:annel)?)[_\s-]*(\d+)/i);
  if (numbered) return `spk:${Number(numbered[1])}`;
  return `name:${raw.toLowerCase()}`;
}

function channelLabelKey(
  part: Pick<HearSegment, "speaker" | "channel">,
): string {
  if (typeof part.channel === "number" && Number.isFinite(part.channel)) {
    return `ch:${part.channel}`;
  }
  return "";
}

/**
 * Pick the identity that actually splits the call.
 * Mono diarize stamps channel 0 on every turn — if we key on channel first,
 * speaker_1 / speaker_2 collapse into one "user."
 * Stereo channel-split often repeats the same speaker label; then channel wins.
 */
export function chooseIdentityMode(
  parts: Array<Pick<HearSegment, "speaker" | "channel">>,
): IdentityMode {
  const speakers = new Set(parts.map(speakerLabelKey).filter(Boolean));
  if (speakers.size >= 2) return "speaker";
  const channels = new Set(parts.map(channelLabelKey).filter(Boolean));
  if (channels.size >= 2) return "channel";
  return "speaker";
}

/** Stable key for a Hear speaker/channel label (`speaker_1`, `ch0`, …). */
export function speakerKey(
  part: Pick<HearSegment, "speaker" | "channel">,
  mode?: IdentityMode,
): string {
  const prefer = mode ?? chooseIdentityMode([part]);
  if (prefer === "channel") {
    return channelLabelKey(part) || speakerLabelKey(part);
  }
  return speakerLabelKey(part) || channelLabelKey(part);
}

function wordText(word: HearWord): string {
  return (word.punctuated_word || word.word || word.text || "").trim();
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeWord(raw: unknown): HearWord | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const text = wordText(rec as HearWord);
  if (!text) return null;
  return {
    word: text,
    text,
    start: asNumber(rec.start),
    end: asNumber(rec.end),
    speaker: readSpeaker(rec as HearWord),
    channel: asNumber(rec.channel),
  };
}

function normalizeSegment(raw: unknown): HearSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const text = typeof rec.text === "string" ? rec.text.trim() : "";
  const nestedWords = Array.isArray(rec.words)
    ? rec.words.map(normalizeWord).filter((w): w is HearWord => Boolean(w))
    : [];
  if (!text && !nestedWords.length) return null;
  return {
    text: text || nestedWords.map((w) => w.word).join(" "),
    start: asNumber(rec.start),
    end: asNumber(rec.end),
    speaker: readSpeaker(rec as HearSegment),
    channel: asNumber(rec.channel),
    words: nestedWords.length ? nestedWords : undefined,
  };
}

/** Unwrap job payloads and coerce speaker ids so 0/1 are not dropped. */
export function normalizeHearResult(raw: unknown): HearJobResult {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const inner =
    obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)
      ? (obj.result as Record<string, unknown>)
      : obj;
  const segments = Array.isArray(inner.segments)
    ? inner.segments.map(normalizeSegment).filter((s): s is HearSegment => Boolean(s))
    : [];
  const topWords = Array.isArray(inner.words)
    ? inner.words.map(normalizeWord).filter((w): w is HearWord => Boolean(w))
    : [];
  const nestedWords = segments.flatMap((s) => s.words || []);
  return {
    text: typeof inner.text === "string" ? inner.text : undefined,
    speakers: asNumber(inner.speakers),
    audio_seconds: asNumber(inner.audio_seconds),
    segments: segments.map((segment) => ({
      text: segment.text,
      start: segment.start,
      end: segment.end,
      speaker: segment.speaker,
      channel: segment.channel,
    })),
    words: topWords.length ? topWords : nestedWords,
  };
}

function uniqueSpeakerCount(
  parts: Array<Pick<HearSegment, "speaker" | "channel">>,
) {
  const mode = chooseIdentityMode(parts);
  const keys = new Set(
    parts
      .map((part) => speakerKey(part, mode))
      .filter((key) => key.length > 0),
  );
  return keys.size;
}

/** Group word-level speaker turns (Sortformer aligns speakers on words). */
export function wordsToSegments(words: HearWord[]): HearSegment[] {
  const mode = chooseIdentityMode(words);
  const segments: HearSegment[] = [];
  for (const word of words) {
    const text = wordText(word);
    if (!text) continue;
    const key = speakerKey(word, mode);
    const last = segments[segments.length - 1];
    if (last && speakerKey(last, mode) === key) {
      last.text = `${(last.text || "").trim()} ${text}`.trim();
      if (typeof word.end === "number") last.end = word.end;
    } else {
      segments.push({
        text,
        start: word.start,
        end: word.end,
        speaker: readSpeaker(word),
        channel: word.channel,
      });
    }
  }
  return segments;
}

/**
 * Prefer word-level speakers when segments collapsed everyone onto one label.
 * PyAI diarize (Sortformer) aligns speakers on words, not always on segments.
 */
export function speakerTurnsFromResult(result: HearJobResult): HearSegment[] {
  const normalized = normalizeHearResult(result);
  const segments = (normalized.segments || []).filter(
    (segment) => (segment.text || "").trim().length > 0,
  );
  const words = normalized.words || [];
  const wordTurns = words.length ? wordsToSegments(words) : [];
  const segmentSpeakers = uniqueSpeakerCount(segments);
  const wordSpeakers = uniqueSpeakerCount(wordTurns);
  const reported = normalized.speakers ?? 0;

  if (wordTurns.length && wordSpeakers > segmentSpeakers) {
    return wordTurns;
  }
  if (segmentSpeakers <= 1 && wordSpeakers > 1) {
    return wordTurns;
  }
  if (reported >= 2 && wordSpeakers >= 2) {
    return wordTurns;
  }
  return segments;
}

function roleLabelsInOrder(
  turns: HearSegment[],
  mode: IdentityMode,
): Map<string, string> {
  const labels = new Map<string, string>();
  let next = 0;
  for (const turn of turns) {
    const key = speakerKey(turn, mode);
    if (!key || labels.has(key)) continue;
    labels.set(key, ROLE_LABELS[next] || `Speaker ${next + 1}`);
    next += 1;
  }
  return labels;
}

function displaySpeaker(
  turn: HearSegment,
  labels: Map<string, string>,
  index: number,
  mode: IdentityMode,
): string {
  const key = speakerKey(turn, mode);
  if (key && labels.has(key)) return labels.get(key)!;
  const raw = readSpeaker(turn);
  if (raw) return raw;
  if (typeof turn.channel === "number") return `Speaker ${turn.channel}`;
  return index % 2 === 0 ? "Rep" : "Prospect";
}

export function segmentsToTranscript(
  segments: HearSegment[],
): TranscriptLine[] {
  const mode = chooseIdentityMode(segments);
  const labels = roleLabelsInOrder(segments, mode);
  return segments
    .map((segment, index) => {
      const text = (segment.text || "").trim();
      return {
        id: `L${index + 1}`,
        index,
        speaker: displaySpeaker(segment, labels, index, mode),
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
    .filter((line) => line.text.length > 0)
    .map((line, index) => ({ ...line, id: `L${index + 1}`, index }));
}

export function hearResultToTranscript(result: HearJobResult): TranscriptLine[] {
  const normalized = normalizeHearResult(result);
  const turns = speakerTurnsFromResult(normalized);
  if (turns.length) return segmentsToTranscript(turns);

  const text = (normalized.text || "").trim();
  if (!text) return [];

  return text
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .map((line, index) => ({
      id: `L${index + 1}`,
      index,
      speaker: index % 2 === 0 ? "Rep" : "Prospect",
      text: line.trim(),
    }));
}

export function transcriptToUtterances(
  transcript: TranscriptLine[],
): RecapUtterance[] {
  return transcript.map((line, index) => {
    const startS = (line.startMs ?? index * 4_000) / 1000;
    const endS =
      (line.endMs ?? (line.startMs ?? index * 4_000) + 3_000) / 1000;
    const role: "agent" | "customer" =
      /rep|agent|seller|ae|speaker[_\s-]*0|ch(?:annel)?[_\s-]*0/i.test(
        line.speaker,
      )
        ? "agent"
        : /prospect|customer|buyer|speaker[_\s-]*1|ch(?:annel)?[_\s-]*1/i.test(
              line.speaker,
            )
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
