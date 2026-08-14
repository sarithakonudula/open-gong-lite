"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

// Deterministic pseudo-waveform: bar heights hashed from the run id so the
// player looks like the design without inventing per-sample amplitude data.
function waveformBars(seed: string, count = 72): number[] {
  const bars: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(0.25 + (h % 1000) / 1400);
  }
  return bars;
}

const RATES = [1, 1.25, 1.5, 2];

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type DetailLine = {
  id: string;
  speaker: string;
  text: string;
  startMs?: number;
  highlight: boolean;
};

export type DetailSummaryItem = {
  text: string;
  lineId: string;
  timestamp: string;
  startMs: number | null;
};

export type RecordingDetail = {
  id: string;
  title: string;
  company: string;
  date: string;
  durationLabel: string | null;
  dealState: "Positive" | "Neutral" | "At Risk";
  score: number;
  scoreBasis: "momentum" | "coverage";
  hasAudio: boolean;
  transcript: DetailLine[];
  summary: DetailSummaryItem[];
  topics: string[];
  email: { subject: string; body: string } | null;
};

const STATE_STYLE: Record<RecordingDetail["dealState"], string> = {
  Positive: "bg-emerald-50 text-emerald-700",
  Neutral: "bg-indigo-50 text-indigo-600",
  "At Risk": "bg-red-50 text-red-600",
};

const TOPIC_STYLE: Record<string, string> = {
  pricing: "bg-blue-50 text-blue-600",
  competitor: "bg-orange-50 text-orange-600",
  "high intent": "bg-emerald-50 text-emerald-700",
  "low intent": "bg-emerald-50 text-emerald-700",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = ["bg-rose-400", "bg-emerald-500", "bg-indigo-400", "bg-amber-400"];

type PlaybookInsight = { text: string; refs: string[] };
type Playbook = {
  mode: "hubspot" | "local";
  winPatterns: PlaybookInsight[];
  lossPatterns: PlaybookInsight[];
  recommendations: PlaybookInsight[];
  basis: string;
};

export function RecordingDetailClient({ detail }: { detail: RecordingDetail }) {
  const [tab, setTab] = useState<"transcript" | "email">("transcript");
  const [emailDraft, setEmailDraft] = useState(detail.email);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [playbookStatus, setPlaybookStatus] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);
  const bars = useMemo(() => waveformBars(detail.id), [detail.id]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => null);
    else audio.pause();
  }

  function cycleRate() {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = RATES[next]!;
  }

  function seekFraction(fraction: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = fraction * audio.duration;
    audio.play().catch(() => null);
  }

  async function generatePlaybook() {
    setPlaybookStatus("Mining similar deals…");
    try {
      const response = await fetch("/api/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: detail.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Playbook failed");
      setPlaybook(data.playbook);
      setPlaybookStatus(
        data.droppedInsights > 0
          ? `${data.droppedInsights} unverifiable insight${data.droppedInsights === 1 ? "" : "s"} dropped by the gate.`
          : null,
      );
    } catch (error) {
      setPlaybookStatus(error instanceof Error ? error.message : "Playbook failed");
    }
  }

  const speakerColor = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const line of detail.transcript) {
      if (!map.has(line.speaker)) {
        map.set(line.speaker, AVATAR_COLORS[i % AVATAR_COLORS.length]!);
        i += 1;
      }
    }
    return map;
  }, [detail.transcript]);

  function jumpTo(startMs: number | null) {
    if (startMs == null || !audioRef.current) return;
    audioRef.current.currentTime = startMs / 1000;
    audioRef.current.play().catch(() => null);
  }

  async function regenerateEmail() {
    setEmailStatus("Drafting from verified claims…");
    try {
      const response = await fetch("/api/email/contextual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: detail.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft failed");
      setEmailDraft({ subject: data.subject, body: data.body });
      setEmailStatus(
        data.source === "llm_crm"
          ? "LLM draft from verified claims + CRM context."
          : "Deterministic draft — every bullet gate-passed.",
      );
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Draft failed");
    }
  }

  const dateLabel = new Date(detail.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="px-8 py-6">
      <Link href="/recordings" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>
        Back to Recordings
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{detail.title}</h1>
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-[9px] font-bold text-indigo-600">
            {initials(detail.company)}
          </span>
          {detail.company}
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-500">{dateLabel}</span>
        {detail.durationLabel && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">{detail.durationLabel}</span>
          </>
        )}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLE[detail.dealState]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {detail.dealState}
        </span>
      </div>

      {detail.hasAudio ? (
        <div className="mt-5 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 shadow-sm">
          <audio
            ref={audioRef}
            preload="metadata"
            src={`/api/runs/${detail.id}/audio`}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            className="hidden"
          />
          <button
            onClick={togglePlay}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {playing ? (
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor" className="ml-0.5 h-4 w-4"><path d="M4.5 3.2v9.6a.6.6 0 0 0 .92.5l7.2-4.8a.6.6 0 0 0 0-1L5.42 2.7a.6.6 0 0 0-.92.5Z"/></svg>
            )}
          </button>
          <div
            className="flex h-9 flex-1 cursor-pointer items-center gap-[2px]"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekFraction((e.clientX - rect.left) / rect.width);
            }}
          >
            {bars.map((h, i) => {
              const played = duration > 0 && i / bars.length <= current / duration;
              return (
                <span
                  key={i}
                  className={`w-[3px] rounded-full ${played ? "bg-indigo-600" : "bg-indigo-200"}`}
                  style={{ height: `${Math.round(h * 34)}px` }}
                />
              );
            })}
          </div>
          <span className="shrink-0 text-sm tabular-nums text-gray-600">
            {fmt(current)} / {fmt(duration)}
          </span>
          <button
            onClick={() => seekFraction(0)}
            title="Restart"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M8 3a5 5 0 1 1-4.7 3.3"/><path d="M3 2v4h4"/></svg>
          </button>
          <button
            onClick={cycleRate}
            className="shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            {RATES[rateIndex]!.toFixed(RATES[rateIndex]! % 1 === 0 ? 1 : 2)}x
          </button>
          <a
            href={`/api/runs/${detail.id}/audio`}
            download
            title="Download recording"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M8 2.5v8m0 0 3-3m-3 3-3-3"/><path d="M3 13.5h10"/></svg>
          </a>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-white px-5 py-3 text-sm text-gray-400">
          No audio stored for this call — transcript and insights below.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="flex gap-1 border-b border-gray-200">
            {(["transcript", "email"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                  tab === t
                    ? "border border-b-0 border-gray-200 bg-white text-indigo-600"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "transcript" ? "Transcript" : "Draft Email"}
              </button>
            ))}
          </div>

          {tab === "transcript" && (
            <div className="rounded-b-xl rounded-tr-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="space-y-5">
                {detail.transcript.map((line) => (
                  <button
                    key={line.id}
                    onClick={() => jumpTo(line.startMs ?? null)}
                    className={`flex w-full gap-3 rounded-lg p-2 text-left ${line.highlight ? "bg-violet-50" : ""} ${line.startMs != null ? "hover:bg-gray-50" : "cursor-default"}`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${speakerColor.get(line.speaker)}`}>
                      {initials(line.speaker)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">{line.speaker}</span>
                        {line.startMs != null && (
                          <span className="text-xs font-medium text-sky-500">
                            {new Date(line.startMs).toISOString().slice(14, 19)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-gray-700">
                        {line.text}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "email" && (
            <div className="rounded-b-xl rounded-tr-xl border border-gray-200 bg-white p-5 shadow-sm">
              {emailDraft ? (
                <>
                  <p className="text-sm font-semibold">{emailDraft.subject}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {emailDraft.body}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  No email drafted for this call yet.
                </p>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={regenerateEmail}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Regenerate draft
                </button>
                {emailDraft && (
                  <button
                    onClick={() => navigator.clipboard.writeText(`${emailDraft.subject}\n\n${emailDraft.body}`)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Copy
                  </button>
                )}
              </div>
              {emailStatus && <p className="mt-2 text-xs text-gray-500">{emailStatus}</p>}
              <p className="mt-3 text-xs text-gray-400">
                Drafted only from claims that passed the receipts gate — unproven
                or injected lines never reach this email.
              </p>
            </div>
          )}
        </div>

        <aside>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-indigo-500"><circle cx="10" cy="10" r="7"/><path d="M10 3v14M3 10h14M5.5 5.5c3 3 6 3 9 0M5.5 14.5c3-3 6-3 9 0"/></svg>
            Call Insights
          </h2>

          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Overall sentiment
            </p>
            <div className="mt-2 flex items-center gap-4">
              <span className={`text-4xl font-bold ${detail.score >= 40 ? "text-emerald-500" : "text-red-500"}`}>
                {detail.score}%
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${detail.score >= 40 ? "bg-emerald-500" : "bg-red-400"}`}
                  style={{ width: `${detail.score}%` }}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              {detail.scoreBasis === "momentum"
                ? "computed as deal momentum from gate-passed claims"
                : "computed as receipt coverage of the call's claims"}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Summary
            </p>
            <div className="mt-3 space-y-4">
              {detail.summary.map((item) => (
                <button
                  key={item.lineId + item.text.slice(0, 12)}
                  onClick={() => jumpTo(item.startMs)}
                  className="flex w-full gap-3 text-left"
                >
                  <span className="mt-0.5 h-fit shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    {item.timestamp}
                  </span>
                  <span className="text-sm leading-relaxed text-gray-700">{item.text}</span>
                </button>
              ))}
              {detail.summary.length === 0 && (
                <p className="text-sm text-gray-500">No verified summary claims.</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Topics mentioned
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {detail.topics.map((t) => (
                <span key={t} className={`rounded-md px-2 py-1 text-xs ${TOPIC_STYLE[t] ?? "bg-gray-100 text-gray-600"}`}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Path to close
            </p>
            {!playbook && (
              <button
                onClick={generatePlaybook}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Generate playbook from similar deals
              </button>
            )}
            {playbook && (
              <div className="mt-3 space-y-3">
                {playbook.winPatterns.map((p) => (
                  <p key={p.text.slice(0, 24)} className="text-sm leading-relaxed text-gray-700">
                    <span className="font-medium text-emerald-600">Won when:</span> {p.text}
                  </p>
                ))}
                {playbook.lossPatterns.map((p) => (
                  <p key={p.text.slice(0, 24)} className="text-sm leading-relaxed text-gray-700">
                    <span className="font-medium text-red-500">Lost when:</span> {p.text}
                  </p>
                ))}
                {playbook.recommendations.map((p) => (
                  <div key={p.text.slice(0, 24)}>
                    <p className="text-sm leading-relaxed text-gray-700">
                      <span className="font-medium text-indigo-600">Do:</span> {p.text}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      based on: {p.refs.slice(0, 3).join(" · ")}
                      {p.refs.length > 3 ? ` +${p.refs.length - 3}` : ""}
                    </p>
                  </div>
                ))}
                {playbook.winPatterns.length + playbook.lossPatterns.length + playbook.recommendations.length === 0 && (
                  <p className="text-sm text-gray-500">
                    Not enough history yet — analyze more calls or connect HubSpot.
                  </p>
                )}
                <p className="text-xs text-gray-400">{playbook.basis}</p>
              </div>
            )}
            {playbookStatus && (
              <p className="mt-2 text-xs text-gray-500">{playbookStatus}</p>
            )}
          </div>

          <Link
            href={`/runs/${detail.id}`}
            className="mt-4 block rounded-xl border border-gray-200 bg-white p-4 text-sm text-indigo-600 shadow-sm hover:bg-gray-50"
          >
            Open the receipts view → every claim, gated against the transcript
          </Link>
        </aside>
      </div>
    </div>
  );
}
