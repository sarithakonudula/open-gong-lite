import { TranscriptLine } from "./types";

export type HearSegment = {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
  channel?: number;
};

export type HearWord = {
  word?: string;
  text?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  speaker?: string;
  channel?: number;
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

/** Stable key for a Hear speaker/channel label (`speaker_1`, `ch0`, …). */
export function speakerKey(
  part: Pick<HearSegment, "speaker" | "channel">,
): string {
  if (typeof part.channel === "number" && Number.isFinite(part.channel)) {
    return `ch:${part.channel}`;
  }
  const raw = (part.speaker || "").trim();
  if (!raw) return "";
  const numbered = raw.match(/(?:speaker|ch(?:annel)?)[_\s-]*(\d+)/i);
  if (numbered) return `spk:${Number(numbered[1])}`;
  return `name:${raw.toLowerCase()}`;
}

function wordText(word: HearWord): string {
  return (word.punctuated_word || word.word || word.text || "").trim();
}

function uniqueSpeakerCount(
  parts: Array<Pick<HearSegment, "speaker" | "channel">>,
) {
  const keys = new Set(
    parts.map((part) => speakerKey(part)).filter((key) => key.length > 0),
  );
  return keys.size;
}

/** Group word-level speaker turns (Sortformer aligns speakers on words). */
export function wordsToSegments(words: HearWord[]): HearSegment[] {
  const segments: HearSegment[] = [];
  for (const word of words) {
    const text = wordText(word);
    if (!text) continue;
    const key = speakerKey(word);
    const last = segments[segments.length - 1];
    if (last && speakerKey(last) === key) {
      last.text = `${(last.text || "").trim()} ${text}`.trim();
      if (typeof word.end === "number") last.end = word.end;
    } else {
      segments.push({
        text,
        start: word.start,
        end: word.end,
        speaker: word.speaker,
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
  const segments = (result.segments || []).filter(
    (segment) => (segment.text || "").trim().length > 0,
  );
  const words = result.words || [];
  const wordTurns = words.length ? wordsToSegments(words) : [];
  const segmentSpeakers = uniqueSpeakerCount(segments);
  const wordSpeakers = uniqueSpeakerCount(wordTurns);

  if (wordTurns.length && wordSpeakers > Math.max(1, segmentSpeakers)) {
    return wordTurns;
  }
  if (segmentSpeakers <= 1 && wordSpeakers > 1) {
    return wordTurns;
  }
  return segments;
}

function roleLabelsInOrder(turns: HearSegment[]): Map<string, string> {
  const labels = new Map<string, string>();
  let next = 0;
  for (const turn of turns) {
    const key = speakerKey(turn);
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
): string {
  const key = speakerKey(turn);
  if (key && labels.has(key)) return labels.get(key)!;
  const raw = turn.speaker?.trim();
  if (raw) return raw;
  if (typeof turn.channel === "number") return `Speaker ${turn.channel}`;
  return index % 2 === 0 ? "Rep" : "Prospect";
}

export function segmentsToTranscript(
  segments: HearSegment[],
): TranscriptLine[] {
  const labels = roleLabelsInOrder(segments);
  return segments
    .map((segment, index) => {
      const text = (segment.text || "").trim();
      return {
        id: `L${index + 1}`,
        index,
        speaker: displaySpeaker(segment, labels, index),
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
  const turns = speakerTurnsFromResult(result);
  if (turns.length) return segmentsToTranscript(turns);

  const text = (result.text || "").trim();
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
