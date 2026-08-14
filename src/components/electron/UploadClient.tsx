"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function UploadClient() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyzeUpload() {
    if (!file) {
      fileInput.current?.click();
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error || "Upload failed");
      router.push(`/recordings/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(null);
    }
  }

  async function analyzeUrl() {
    setBusy("url");
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error || "URL analyze failed");
      router.push(`/recordings/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL analyze failed");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <h1 className="text-center text-3xl font-bold tracking-tight">Getting Started</h1>
      <p className="mt-2 text-center text-sm text-gray-500">
        Meetings recorded, highlights delivered, structured insights, instantly
        organized for action.
      </p>

      {error && (
        <p className="mx-auto mt-4 max-w-xl rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Link
          href="/live"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow"
        >
          <div className="flex items-center justify-center">
            <span className="flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1.5 text-xs text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Recording
            </span>
          </div>
          <div className="mt-4 flex h-48 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 text-6xl">
            🎙
          </div>
          <p className="mt-5 text-center font-bold">Live call recording</p>
          <p className="mt-1 text-center text-sm text-gray-500">
            Stream a live call through the mic — diarized, gated, and scored as
            it lands.
          </p>
        </Link>

        <div className="space-y-6">
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6"><path d="M12 16V6m0 0-4 4m4-4 4 4"/><path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/></svg>
            </span>
            <p className="mt-3 font-semibold">
              {file ? file.name : "Drag and drop audio files to upload"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Your audio will be private until you publish to community.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={analyzeUpload}
              disabled={busy === "upload"}
              className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "upload" ? "Analyzing…" : file ? "Analyze upload" : "Choose file"}
            </button>
          </div>

          <div className="rounded-2xl bg-gray-100 p-8 text-center">
            <p className="font-semibold">Paste a media URL</p>
            <p className="mt-1 text-xs text-gray-500">
              Your audio will be private until you publish to community. Fathom,
              Fireflies, Drive, and Loom links work too.
            </p>
            <input
              className="mt-4 w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-300"
              placeholder="https://…/call.mp3"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              onClick={analyzeUrl}
              disabled={url.trim().length < 9 || busy === "url"}
              className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "url" ? "Fetching…" : "Analyze url"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
