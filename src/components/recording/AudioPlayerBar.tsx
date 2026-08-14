"use client";

import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatDuration } from "@/lib/format";

const SPEEDS = [1, 1.25, 1.5, 2];
const BAR_COUNT = 110;

// Deterministic pseudo-random bar heights seeded from the run id. This is a
// scrubber styled as a waveform, not a rendering of the audio itself —
// decoding up-to-100MB files client-side would lock the tab.
function seededBars(seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    const t = h / 0xffffffff;
    const envelope = 0.55 + 0.45 * Math.sin((i / BAR_COUNT) * Math.PI);
    bars.push(0.18 + 0.82 * t * envelope);
  }
  return bars;
}

export function AudioPlayerBar({
  runId,
  audioRef,
}: {
  runId: string;
  audioRef: RefObject<HTMLAudioElement | null>;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const bars = useMemo(() => seededBars(runId), [runId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentSec(audio.currentTime);
    const onMeta = () =>
      setDurationSec(Number.isFinite(audio.duration) ? audio.duration : null);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    onMeta();
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioRef]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [audioRef]);

  function seekFromClick(event: React.MouseEvent) {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track || !durationSec) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    audio.currentTime = ratio * durationSec;
  }

  function restart() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  function cycleSpeed() {
    const audio = audioRef.current;
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio) audio.playbackRate = next;
  }

  const progress = durationSec ? currentSec / durationSec : 0;

  return (
    <div className="card flex items-center gap-4 px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-deep"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5" aria-hidden>
            <rect x="6.5" y="5" width="4" height="14" rx="1" />
            <rect x="13.5" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5" aria-hidden>
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>

      <div
        ref={trackRef}
        className="relative flex h-11 flex-1 cursor-pointer items-center gap-[2px] overflow-hidden"
        onClick={seekFromClick}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={durationSec ?? 0}
        aria-valuenow={currentSec}
        title="Illustrative waveform — click to seek"
      >
        {bars.map((height, i) => {
          const played = durationSec ? i / BAR_COUNT <= progress : false;
          return (
            <span
              key={i}
              className={`w-[3px] shrink-0 rounded-full ${played ? "bg-brand" : "bg-edge-strong"}`}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          );
        })}
      </div>

      <span className="shrink-0 text-[13px] tabular-nums text-fg-muted">
        {formatDuration(currentSec * 1000) ?? "0:00"} /{" "}
        {durationSec != null ? (formatDuration(durationSec * 1000) ?? "0:00") : "--:--"}
      </span>

      <button
        type="button"
        onClick={restart}
        aria-label="Restart"
        className="btn-ghost !rounded-full !p-2.5"
        title="Restart"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      </button>

      <button
        type="button"
        onClick={cycleSpeed}
        className="btn-ghost !rounded-full !px-3 !py-2 text-[13px] font-semibold"
        title="Playback speed"
      >
        {speed}x
      </button>

      <a
        href={`/api/runs/${runId}/audio`}
        download
        aria-label="Download audio"
        className="btn-ghost !rounded-full !p-2.5"
        title="Download audio"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M12 4v11" />
          <path d="m7.5 11 4.5 4.5L16.5 11" />
          <path d="M4.5 19.5h15" />
        </svg>
      </a>
    </div>
  );
}
