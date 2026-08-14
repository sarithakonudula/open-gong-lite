"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startWavCapture, type WavCapture } from "@/lib/browser-wav";
import type { SampleCall, TranscriptLine } from "@/lib/types";

type Props = {
  samples: SampleCall[];
  defaultSlug: string;
};

type Mode = "script" | "mic";

export function LiveCallClient({ samples, defaultSlug }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("script");
  const [slug, setSlug] = useState(defaultSlug);
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [partial, setPartial] = useState<string | null>(null);
  const [status, setStatus] = useState(
    "Scripted demo works offline. Mic mode records WAV and diarizes speakers with PyAI Hear jobs.",
  );
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pyaiReady, setPyaiReady] = useState<boolean | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wavCaptureRef = useRef<WavCapture | null>(null);
  const abortScriptRef = useRef(false);

  const visible = useMemo(
    () => lines.slice(0, visibleCount),
    [lines, visibleCount],
  );

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data: { pyai?: { configured?: boolean } }) => {
        setPyaiReady(Boolean(data.pyai?.configured));
      })
      .catch(() => setPyaiReady(false));
  }, []);

  useEffect(() => {
    return () => {
      abortScriptRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      wavCaptureRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [visibleCount, partial, elapsed]);

  function clearTimers() {
    abortScriptRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    timerRef.current = null;
    elapsedRef.current = null;
  }

  function startElapsed() {
    setElapsed(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
  }

  async function loadScript(nextSlug: string) {
    setError(null);
    const res = await fetch(`/api/samples/${encodeURIComponent(nextSlug)}`);
    const data = (await res.json()) as {
      transcript?: TranscriptLine[];
      meta?: { title: string };
      error?: string;
    };
    if (!res.ok || !data.transcript) {
      throw new Error(data.error || "Failed to load sample script");
    }
    setLines(data.transcript);
    setTitle((t) => t || data.meta?.title || nextSlug);
    setVisibleCount(0);
    setPartial(null);
    return data.transcript;
  }

  async function streamScript(transcript: TranscriptLine[]) {
    abortScriptRef.current = false;
    for (let i = 0; i < transcript.length; i++) {
      if (abortScriptRef.current) return;
      const line = transcript[i];
      const words = line.text.split(/\s+/);
      const mid = Math.max(2, Math.floor(words.length * 0.55));
      setPartial(`${words.slice(0, mid).join(" ")}…`);
      await new Promise((r) => {
        timerRef.current = setTimeout(r, 420);
      });
      if (abortScriptRef.current) return;
      setPartial(null);
      setVisibleCount(i + 1);
      await new Promise((r) => {
        timerRef.current = setTimeout(r, 680);
      });
    }
  }

  async function startScript() {
    if (busy || live) return;
    setBusy(true);
    setError(null);
    try {
      const transcript = await loadScript(slug);
      setLive(true);
      setMode("script");
      setStatus("Live: streaming script…");
      startElapsed();
      await streamScript(transcript);
      if (!abortScriptRef.current) {
        setStatus("Script complete. End the call to fire deal notes.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start live call");
      setLive(false);
    } finally {
      setBusy(false);
    }
  }

  async function startMic() {
    if (busy || live) return;
    setBusy(true);
    setError(null);
    try {
      if (pyaiReady === false) {
        throw new Error(
          "PyAI key not ready. Use scripted demo, or set PYAI_API_KEY / enable sandbox mint.",
        );
      }
      const capture = await startWavCapture(16_000);
      wavCaptureRef.current = capture;
      setLines([]);
      setVisibleCount(0);
      setPartial(null);
      setLive(true);
      setMode("mic");
      setTitle((t) => t || "Live mic call");
      setStatus(
        "Recording. Speak clearly for 5+ seconds, then end the call.",
      );
      startElapsed();
    } catch (err) {
      wavCaptureRef.current?.stream.getTracks().forEach((t) => t.stop());
      wavCaptureRef.current = null;
      setError(
        err instanceof Error ? err.message : "Microphone access failed",
      );
      setLive(false);
    } finally {
      setBusy(false);
    }
  }

  async function endScriptCall() {
    clearTimers();
    setPartial(null);
    setBusy(true);
    setStatus("Call ended. Checking every citation…");
    setError(null);

    const transcript = lines.slice(0, Math.max(visibleCount, 1));
    try {
      const res = await fetch("/api/live/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleSlug: slug,
          title: title.trim() || undefined,
          transcript,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || "Finalize failed");
      }
      setStatus("Notes ready. Opening them now…");
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
      setBusy(false);
      setStatus("Finalize failed. Try again or stream more of the script.");
      setLive(false);
    }
  }

  async function endMicCall() {
    clearTimers();
    setBusy(true);
    setStatus("Transcribing, splitting speakers, checking citations…");
    setError(null);

    const capture = wavCaptureRef.current;
    const seconds = elapsed;

    try {
      if (!capture) throw new Error("Recorder not active");
      if (seconds < 4) {
        throw new Error(
          "Recording too short. Speak for at least 5 seconds, then end.",
        );
      }

      const blob = await capture.stop();
      wavCaptureRef.current = null;

      if (blob.size < 2_000) {
        throw new Error("Recording empty. Check mic permissions and try again.");
      }

      const form = new FormData();
      form.append("file", blob, "live-mic.wav");
      form.append("filename", "live-mic.wav");
      if (title.trim()) form.append("title", title.trim());

      const res = await fetch("/api/live/record", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || "Live mic finalize failed");
      }
      setStatus("Notes ready. Opening them now…");
      router.push(`/runs/${data.id}`);
    } catch (err) {
      capture?.stream.getTracks().forEach((t) => t.stop());
      wavCaptureRef.current = null;
      const message =
        err instanceof Error ? err.message : "Mic finalize failed";
      setError(
        message.includes("transcription") || message.includes("Hear")
          ? `${message} Or switch to Scripted demo for a guaranteed path.`
          : message,
      );
      setBusy(false);
      setLive(false);
      setStatus("Mic finalize failed. Try again with clearer speech, or use Scripted demo.");
    }
  }

  async function endCall() {
    if (mode === "mic") return endMicCall();
    return endScriptCall();
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-atmosphere" />
      <div className="signal-bar absolute left-0 right-0 top-0 h-px" />

      <div className="relative mx-auto w-full max-w-5xl px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-soft">
              Coaching
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">
              Live call
            </h1>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-fg-soft">
            Live call · no bot in the meeting
          </p>
        </div>

        <p className="mt-4 max-w-2xl text-fg-muted">
          Stream a sample script offline, or record with your mic as WAV PCM.
          End the call and it splits the speakers, writes the notes, and
          checks every citation.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <button
            type="button"
            className={mode === "script" && !live ? "btn-primary" : "btn-ghost"}
            disabled={live || busy}
            onClick={() => setMode("script")}
          >
            Scripted demo
          </button>
          <button
            type="button"
            className={mode === "mic" && !live ? "btn-primary" : "btn-ghost"}
            disabled={live || busy}
            onClick={() => setMode("mic")}
          >
            Record mic
          </button>
          <Link href="/how" className="btn-ghost">
            How the checking works
          </Link>
        </div>

        {mode === "script" ? (
          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.16em] text-fg-soft">
                Script
              </span>
              <select
                className="field mt-2"
                value={slug}
                disabled={live || busy}
                onChange={(e) => setSlug(e.target.value)}
              >
                {samples.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={live || busy}
              onClick={startScript}
            >
              {live ? "Live…" : "Start script"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={(!live && visibleCount === 0) || busy}
              onClick={endCall}
            >
              {busy && live ? "Finalizing…" : "End call → notes"}
            </button>
          </div>
        ) : (
          <div className="mt-8 flex flex-wrap items-end gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={live || busy}
              onClick={startMic}
            >
              {live ? "Recording…" : "Start mic"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!live || busy}
              onClick={endCall}
            >
              {busy ? "Transcribing…" : "End call → Hear + notes"}
            </button>
            <p className="text-sm text-fg-soft">
              PyAI:{" "}
              {pyaiReady === null
                ? "checking…"
                : pyaiReady
                  ? "ready"
                  : "not configured"}
            </p>
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-[0.16em] text-fg-soft">
            Call title
          </span>
          <input
            className="field mt-2"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional override"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-fg-soft">
          <p>{status}</p>
          {live && (
            <span className="inline-flex items-center gap-2 rounded-full border border-danger/40 bg-danger-soft px-3 py-1 text-danger">
              <span className="live-dot" />
              {mm}:{ss}
            </span>
          )}
        </div>

        <div
          ref={scrollRef}
          className="mt-6 max-h-[52vh] overflow-y-auto rounded-[1.4rem] border border-edge bg-surface p-5 font-[family-name:var(--font-mono)] text-sm leading-relaxed"
        >
          {mode === "mic" && live && visible.length === 0 ? (
            <p className="text-fg-soft">
              Listening (16 kHz WAV)… transcript appears after you end the call.
            </p>
          ) : visible.length === 0 && !partial ? (
            <p className="text-fg-soft">
              Transcript will appear here as the call runs.
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((line) => (
                <li key={line.id}>
                  <span className="text-brand">{line.speaker}:</span>{" "}
                  <span className="text-fg">{line.text}</span>
                </li>
              ))}
              {partial && (
                <li className="opacity-60">
                  <span className="text-brand">…</span> {partial}
                </li>
              )}
            </ul>
          )}
        </div>

        {error && (
          <p className="mt-6 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-fg">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
