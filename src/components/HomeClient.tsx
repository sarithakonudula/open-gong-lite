"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SampleCall } from "@/lib/types";

type StatusPayload = {
  pyai?: {
    configured?: boolean;
    source?: string;
    preview?: string | null;
    error?: string;
  };
  llmFallback?: boolean;
  recapPackId?: string;
};

type RunSummary = {
  id: string;
  createdAt: string;
  status: string;
  source: string;
  sourceLabel: string;
  title: string;
};

export function HomeClient({ samples }: { samples: SampleCall[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [search, setSearch] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((res) => res.json())
      .then((data: StatusPayload) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setSearchBusy(true);
      const q = search.trim();
      fetch(`/api/runs?${new URLSearchParams(q ? { q } : {})}`)
        .then((res) => res.json())
        .then((data: { runs?: RunSummary[] }) => {
          if (!cancelled) setRuns(data.runs || []);
        })
        .catch(() => {
          if (!cancelled) setRuns([]);
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [search]);

  const canUpload = useMemo(() => Boolean(file) && !busy, [file, busy]);
  const canUrl = useMemo(() => url.trim().length > 8 && !busy, [url, busy]);

  async function runDemo(slug: string) {
    setError(null);
    setBusy(slug);
    try {
      const res = await fetch(`/api/demos/${slug}`, { method: "POST" });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || "Demo failed");
      }
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
      setBusy(null);
    }
  }

  async function analyzeUpload() {
    if (!file) return;
    setError(null);
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || "Upload analyze failed");
      }
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(null);
    }
  }

  async function analyzeUrl() {
    setError(null);
    setBusy("url");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || "URL analyze failed");
      }
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL analyze failed");
      setBusy(null);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-atmosphere" />
      <div className="signal-bar absolute left-0 right-0 top-0 h-px" />

      <section className="relative mx-auto flex min-h-[78svh] w-full max-w-6xl flex-col justify-center px-5 py-14 md:px-8">
        <p className="animate-rise text-xs uppercase tracking-[0.28em] text-mist">
          PyAI Hackathon · Open source offensive
        </p>
        <h1 className="animate-rise-delay mt-5 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(3.2rem,9vw,6.4rem)] leading-[0.92] tracking-[-0.04em]">
          OpenGong Lite
        </h1>
        <p className="animate-rise-delay-2 mt-6 max-w-xl text-lg leading-relaxed text-fog/90 md:text-xl">
          Deal intelligence from any call: summary, objections, intent, next
          steps, follow-up email — each claim pinned to a transcript receipt.
        </p>

        <div className="animate-rise-delay-2 mt-10 flex flex-wrap gap-3">
          <a href="#try" className="btn-primary">
            See deal intelligence →
          </a>
          <a href="/live" className="btn-ghost">
            Live call
          </a>
          <a href="/how" className="btn-ghost">
            How gates work
          </a>
          <a href="#ingest" className="btn-ghost">
            Upload or paste a link
          </a>
        </div>

        <p className="animate-rise-delay-2 mt-6 text-sm text-mist">
          PyAI:{" "}
          {status?.pyai?.configured
            ? `${status.pyai.source} · ${status.pyai.preview}`
            : status?.pyai?.error
              ? `not ready — ${status.pyai.error}`
              : "checking…"}
          {" · "}
          Hear jobs + Recap pack `{status?.recapPackId || "sales_outbound"}`
          {status?.llmFallback ? " · LLM fallback on" : ""}
        </p>
      </section>

      <section id="try" className="relative mx-auto w-full max-w-6xl px-5 pb-16 md:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight md:text-4xl">
              Run a sample → open deal intelligence
            </h2>
            <p className="mt-2 max-w-2xl text-mist">
              Click any call. You&apos;ll land on a page with summary, objections,
              intent, next steps, and clickable receipts.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {samples.map((sample, index) => (
            <button
              key={sample.slug}
              type="button"
              onClick={() => runDemo(sample.slug)}
              disabled={Boolean(busy)}
              className="group rounded-[1.4rem] border border-white/10 bg-ink-soft/55 p-5 text-left transition hover:border-signal/40 hover:bg-ink-soft/90 disabled:opacity-60"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-mist">
                  {sample.company} · {sample.durationLabel}
                </p>
                <span className="text-signal text-sm opacity-0 transition group-hover:opacity-100">
                  {busy === sample.slug ? "Running…" : "Run →"}
                </span>
              </div>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl tracking-tight">
                {sample.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fog/80">
                {sample.description}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section
        id="history"
        className="relative mx-auto w-full max-w-6xl px-5 pb-16 md:px-8"
      >
        <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight md:text-4xl">
          Search past calls
        </h2>
        <p className="mt-2 max-w-2xl text-mist">
          Find anything you&apos;ve discussed across stored runs — titles,
          transcript lines, and shipped claims.
        </p>
        <input
          className="field mt-6 max-w-xl"
          type="search"
          placeholder="e.g. Fireflies, procurement, SSO…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="mt-2 text-xs text-mist">
          {searchBusy ? "Searching…" : `${runs.length} run${runs.length === 1 ? "" : "s"}`}
        </p>
        <ul className="mt-6 space-y-3">
          {runs.length === 0 ? (
            <li className="text-sm text-mist">
              No runs yet — run a sample above to populate history.
            </li>
          ) : (
            runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  className="w-full rounded-[1.1rem] border border-white/10 bg-ink-soft/40 px-4 py-3 text-left transition hover:border-signal/35"
                  onClick={() => router.push(`/runs/${run.id}`)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-paper">{run.title}</p>
                    <p className="text-xs uppercase tracking-[0.14em] text-mist">
                      {run.status} · {run.source}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-fog/75">
                    {run.sourceLabel} ·{" "}
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section
        id="ingest"
        className="relative mx-auto w-full max-w-6xl px-5 pb-24 md:px-8"
      >
        <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight md:text-4xl">
          Ingest a real call
        </h2>
        <p className="mt-2 max-w-2xl text-mist">
          Live path: Hear async jobs (`diarize`) → Recap (`sales_outbound`) →
          gated receipts. Samples still work offline with no key. Or try the{" "}
          <a href="/live" className="text-signal underline-offset-2 hover:underline">
            live call demo
          </a>
          .
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[1.4rem] border border-white/10 bg-ink-soft/55 p-5">
            <h3 className="text-lg font-semibold">Upload audio</h3>
            <input
              className="field mt-4"
              type="file"
              accept="audio/*,video/webm,video/mp4"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              className="btn-primary mt-4"
              disabled={!canUpload}
              onClick={analyzeUpload}
            >
              {busy === "upload" ? "Transcribing…" : "Analyze upload"}
            </button>
          </div>

          <div className="rounded-[1.4rem] border border-white/10 bg-ink-soft/55 p-5">
            <h3 className="text-lg font-semibold">Paste a media URL</h3>
            <input
              className="field mt-4"
              type="url"
              placeholder="https://…/call.mp3"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary mt-4"
              disabled={!canUrl}
              onClick={analyzeUrl}
            >
              {busy === "url" ? "Fetching…" : "Analyze URL"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-xl border border-heat/40 bg-heat/10 px-4 py-3 text-sm text-paper">
            {error}
          </p>
        )}
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-mist md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p>MIT · OpenGong Lite</p>
          <div className="flex flex-wrap gap-4">
            <a href="/how" className="hover:text-signal">
              How gates work
            </a>
            <a href="/live" className="hover:text-signal">
              Live call
            </a>
            <p>Runs on PyAI · Hear + Recap loop with blocking gates</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
