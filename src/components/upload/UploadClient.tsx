"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SampleCall } from "@/lib/types";

export function UploadClient({ samples }: { samples: SampleCall[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const canUpload = useMemo(() => Boolean(file) && !busy, [file, busy]);
  const canUrl = useMemo(() => url.trim().length > 8 && !busy, [url, busy]);

  const dealSamples = useMemo(
    () => samples.filter((s) => s.dealArc?.id === "brightsmile"),
    [samples],
  );
  const otherSamples = useMemo(
    () => samples.filter((s) => s.dealArc?.id !== "brightsmile"),
    [samples],
  );

  async function runDemo(slug: string) {
    setError(null);
    setBusy(slug);
    try {
      const res = await fetch(`/api/demos/${slug}`, { method: "POST" });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Demo failed");
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
      const trimmed = company.trim();
      if (trimmed) form.append("customerName", trimmed);
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
      const trimmed = company.trim();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          ...(trimmed ? { customerName: trimmed } : {}),
        }),
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

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Getting Started
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          Meetings recorded, highlights delivered, structured insights,
          instantly organized for action.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Link
          href="/live"
          className="card group flex flex-col overflow-hidden p-5 transition hover:border-brand/50"
        >
          <div className="relative flex min-h-64 flex-1 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(150deg,#23253d_0%,#37395c_55%,#2a2c48_100%)]">
            <span className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-medium text-white">
              <span className="live-dot" />
              Recording
              <span className="text-white/60">05:12</span>
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="h-16 w-16 text-white/80 transition group-hover:scale-105"
              aria-hidden
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
            <span className="absolute bottom-4 left-1/2 w-[85%] -translate-x-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-[11.5px] leading-snug text-white/90">
              Don&apos;t worry, everything we talk about is recorded thanks to
              the AI notetaker. Especially the important parts.
            </span>
          </div>
          <h2 className="mt-4 text-center text-lg font-semibold text-fg">
            Live call recording
          </h2>
          <p className="mt-1 text-center text-sm text-fg-muted">
            Record from your mic, end the call, and the notes arrive checked —
            every line cited to the moment it came from.
          </p>
        </Link>

        <div className="flex flex-col gap-6">
          <div
            className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging
                ? "border-brand bg-brand-soft"
                : "border-edge-strong bg-surface"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-edge bg-canvas text-fg-muted">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden
              >
                <path d="M12 16V6" />
                <path d="m7.5 10.5 4.5-4.5 4.5 4.5" />
                <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
              </svg>
            </span>
            <p className="mt-4 text-[15px] font-semibold text-fg">
              {file ? file.name : "Drag and drop audio files to upload"}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Your audio stays private until you share a link.
            </p>
            <input
              ref={fileInput}
              className="hidden"
              type="file"
              accept="audio/*,video/webm,video/mp4"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="btn-ghost !py-2 text-sm"
                onClick={() => fileInput.current?.click()}
              >
                Choose file
              </button>
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                disabled={!canUpload}
                onClick={analyzeUpload}
              >
                {busy === "upload" ? "Transcribing…" : "Analyze upload"}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-canvas px-6 py-7 text-center">
            <p className="text-[15px] font-semibold text-fg">
              Paste a media URL
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Fathom, Fireflies, Google Drive, Loom, Zoom, or a direct media
              link.
            </p>
            <input
              className="field mt-4 bg-white"
              type="url"
              placeholder="https://fathom.video/share/… or https://…/call.mp3"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary mt-3 !py-2 text-sm"
              disabled={!canUrl}
              onClick={analyzeUrl}
            >
              {busy === "url" ? "Fetching…" : "Analyze URL"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium text-fg-muted">
          Company <span className="text-fg-soft">(optional — groups this call under the company)</span>
          <input
            className="field mt-1.5 max-w-sm"
            type="text"
            placeholder="e.g. Brightsmile Dental Group"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-14">
        <h2 className="text-lg font-semibold text-fg">Or try a sample call</h2>
        <p className="mt-1 text-sm text-fg-muted">
          The Brightsmile deal — one deal, six calls — plus one-off samples.
          Samples need no key and land in Recordings like any other call.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...dealSamples, ...otherSamples].map((sample) => (
            <button
              key={sample.slug}
              type="button"
              onClick={() => runDemo(sample.slug)}
              disabled={Boolean(busy)}
              className="card group p-4 text-left transition hover:border-brand/50 disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-soft">
                  {sample.dealArc
                    ? `${sample.dealArc.beat} · ${sample.durationLabel}`
                    : `${sample.company} · ${sample.durationLabel}`}
                </p>
                <span className="text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
                  {busy === sample.slug ? "Running…" : "Run →"}
                </span>
              </div>
              <p className="mt-1.5 text-[15px] font-semibold leading-snug text-fg">
                {sample.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[13px] text-fg-muted">
                {sample.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
