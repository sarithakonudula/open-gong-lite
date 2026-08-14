"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  title: string;
  company: string;
  quote: string | null;
  tags: string[];
  date: string;
  score: number;
  dealState: "Positive" | "Neutral" | "At Risk";
  callKind: string;
};

const STATE_STYLE: Record<Row["dealState"], string> = {
  Positive: "bg-emerald-50 text-emerald-700",
  Neutral: "bg-indigo-50 text-indigo-600",
  "At Risk": "bg-red-50 text-red-600",
};

const TAG_STYLE: Record<string, string> = {
  pricing: "bg-blue-50 text-blue-600",
  competitor: "bg-orange-50 text-orange-600",
  "high intent": "bg-emerald-50 text-emerald-700",
  "low intent": "bg-emerald-50 text-emerald-700",
  "next steps": "bg-orange-50 text-orange-600",
  objection: "bg-orange-50 text-orange-600",
  "pain point": "bg-blue-50 text-blue-600",
};

const SUGGESTIONS = [
  "How can I lead better calls?",
  "What are our customers saying?",
  "Prioritize my top tasks for the week.",
];

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecordingsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "score">("newest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/recordings?${new URLSearchParams(q ? { q } : {})}`)
        .then((r) => r.json())
        .then((d) => setRows(d.recordings ?? []))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  const sorted = [...rows].sort((a, b) =>
    sort === "score" ? b.score - a.score : b.date.localeCompare(a.date),
  );

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Recordings</h1>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 text-gray-400"><circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3 3"/></svg>
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          placeholder="Search for a meeting or ask about your meetings"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setQ(s.split(" ").slice(-2).join(" ").replace(/[?.]/g, ""))}
            className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-100"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <select
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600"
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "score")}
        >
          <option value="newest">Sort: Newest</option>
          <option value="score">Sort: Score</option>
        </select>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_140px_90px_80px_110px] gap-4 border-b border-gray-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <span>Meeting name</span>
          <span>Company name</span>
          <span>Date</span>
          <span>Score</span>
          <span>Deal state</span>
        </div>
        {loading && (
          <p className="px-5 py-6 text-sm text-gray-500">Loading recordings…</p>
        )}
        {!loading && sorted.length === 0 && (
          <p className="px-5 py-6 text-sm text-gray-500">
            No recordings yet — run a sample or{" "}
            <Link href="/upload" className="text-indigo-600 underline">
              upload a call
            </Link>
            .
          </p>
        )}
        {sorted.map((row) => (
          <Link
            key={row.id}
            href={`/recordings/${row.id}`}
            className="grid grid-cols-[1fr_140px_90px_80px_110px] items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-0 hover:bg-gray-50"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{row.title}</span>
              {row.quote && (
                <span className="mt-0.5 block truncate text-sm text-gray-500">
                  “{row.quote}”
                </span>
              )}
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {row.tags.map((t) => (
                  <span
                    key={t}
                    className={`rounded-md px-1.5 py-0.5 text-[11px] ${TAG_STYLE[t] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {t}
                  </span>
                ))}
              </span>
            </span>
            <span className="truncate text-sm text-gray-700">{row.company}</span>
            <span className="text-sm text-gray-500">{dateLabel(row.date)}</span>
            <span className="text-sm font-medium">{row.score}%</span>
            <span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLE[row.dealState]}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {row.dealState}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
