"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SampleDataControls } from "@/components/SampleDataControls";
import { formatDateShort, formatDuration } from "@/lib/format";
import type { RecordingRow } from "@/lib/recording-row";

const ASK_PROMPTS = [
  { label: "How can I lead better calls?", query: "next step" },
  { label: "What are our customers saying?", query: "pricing" },
  { label: "Where are deals at risk?", query: "competitor" },
];

const TAG_CLASS: Record<string, string> = {
  pricing: "chip-neutral",
  competitor: "chip-warn",
  "high intent": "chip-positive",
  "next steps": "chip-brand",
  budget: "chip-neutral",
  timeline: "chip-warn",
  demo: "chip-brand",
  "follow up": "chip-muted",
  objection: "chip-warn",
};

const CALL_TYPE_CLASS: Record<string, string> = {
  Sales: "chip-positive",
  Support: "chip-brand",
  "Customer Success": "chip-neutral",
};

type SentimentFilter = "All" | "Positive" | "Neutral" | "At Risk";
type SortOrder = "newest" | "oldest" | "score";
type KindFilter = "all" | "sales" | "customer_success" | "support";

function initials(company: string): string {
  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const TILE_COLORS = [
  "bg-brand-soft text-brand",
  "bg-positive-soft text-positive",
  "bg-warn-soft text-warn",
  "bg-info-soft text-info",
  "bg-danger-soft text-danger",
];

function tileColor(company: string): string {
  let hash = 0;
  for (const ch of company) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

export function RecordingsClient({ rows }: { rows: RecordingRow[] }) {
  const [search, setSearch] = useState("");
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentFilter>("All");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [kind, setKind] = useState<KindFilter>("all");

  // Text search runs server-side over titles, transcripts, and shipped notes
  // (the same haystack the pipeline verified), then filters the local rows.
  useEffect(() => {
    const q = search.trim();
    let cancelled = false;
    const handle = window.setTimeout(
      () => {
        if (!q) {
          setMatchedIds(null);
          setSearchBusy(false);
          return;
        }
        setSearchBusy(true);
        fetch(`/api/runs?${new URLSearchParams({ q })}`)
          .then((res) => res.json())
          .then((data: { runs?: Array<{ id: string }> }) => {
            if (cancelled) return;
            setMatchedIds(new Set((data.runs ?? []).map((r) => r.id)));
          })
          .catch(() => {
            if (!cancelled) setMatchedIds(new Set());
          })
          .finally(() => {
            if (!cancelled) setSearchBusy(false);
          });
      },
      q ? 220 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [search]);

  const visible = useMemo(() => {
    let out = rows;
    if (search.trim() && matchedIds) out = out.filter((r) => matchedIds.has(r.id));
    if (sentiment !== "All") out = out.filter((r) => r.dealState === sentiment);
    if (kind !== "all") out = out.filter((r) => r.callKind === kind);
    out = [...out];
    if (sort === "newest") {
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === "oldest") {
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else {
      out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
    return out;
  }, [rows, search, matchedIds, sentiment, sort, kind]);

  const kindCounts = useMemo(
    () => ({
      all: rows.length,
      sales: rows.filter((r) => r.callKind === "sales").length,
      customer_success: rows.filter((r) => r.callKind === "customer_success").length,
      support: rows.filter((r) => r.callKind === "support").length,
    }),
    [rows],
  );
  const hasSample = rows.some((r) => r.isSample);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">
        Recordings
      </h1>

      <div className="relative mt-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-fg-soft"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className="field !rounded-xl !py-3 !pl-11"
          type="search"
          placeholder="Search meetings — titles, transcript lines, and shipped notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ASK_PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setSearch(p.query)}
            className="chip chip-brand cursor-pointer !py-1.5 transition hover:brightness-95"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["sales", "Sales"],
            ["customer_success", "Customer success"],
            ["support", "Customer"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={`chip cursor-pointer !py-1.5 ${
              kind === id ? "chip-brand" : "chip-muted"
            }`}
          >
            {label} · {kindCounts[id]}
          </button>
        ))}
      </div>

      {hasSample && (
        <div className="mt-4">
          <SampleDataControls compact afterHref="/recordings" />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {searchBusy
            ? "Searching…"
            : `${visible.length} recording${visible.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex gap-2">
          <select
            className="field !w-auto !py-2 text-sm"
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value as SentimentFilter)}
            aria-label="Filter by deal state"
          >
            <option value="All">Sentiment: All</option>
            <option value="Positive">Positive</option>
            <option value="Neutral">Neutral</option>
            <option value="At Risk">At Risk</option>
          </select>
          <select
            className="field !w-auto !py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            aria-label="Sort order"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="score">Sort: Score</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-4 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">No recordings yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Upload a call, paste a recording link, or load dummy data — every
            analyzed call lands here.
          </p>
          <div className="mx-auto mt-5 max-w-2xl text-left">
            <SampleDataControls compact afterHref="/recordings" />
          </div>
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-edge text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-soft">
                <th className="px-5 py-3">Meeting name</th>
                <th className="px-5 py-3">Company name</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Call type</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-edge align-top last:border-b-0 hover:bg-canvas/60"
                >
                  <td className="max-w-md px-5 py-4">
                    <div className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${tileColor(row.company)}`}
                      >
                        {initials(row.company) || "?"}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/runs/${row.id}`}
                          className="font-semibold text-fg hover:text-brand"
                        >
                          {row.title}
                        </Link>
                        {row.isSample && (
                          <span className="ml-2 align-middle chip chip-warn !py-0.5 text-[10px] uppercase tracking-wide">
                            sample
                          </span>
                        )}
                        {row.pullQuote && (
                          <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">
                            &ldquo;{row.pullQuote}&rdquo;
                          </p>
                        )}
                        {row.topics.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {row.topics.map((tag) => (
                              <span
                                key={tag}
                                className={`chip ${TAG_CLASS[tag] ?? "chip-muted"}`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-fg">{row.company}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                    {formatDateShort(row.createdAt)}
                    {row.durationMs != null && (
                      <span className="block text-[12px] text-fg-soft">
                        {formatDuration(row.durationMs)} min
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {row.score != null ? (
                      <span
                        className="font-semibold text-fg"
                        title={
                          row.scoreSource === "scorecard"
                            ? "Methodology scorecard score"
                            : "Deal momentum score (deterministic, receipt-backed)"
                        }
                      >
                        {row.score}%
                      </span>
                    ) : (
                      <span className="text-fg-soft">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`chip ${CALL_TYPE_CLASS[row.callType] ?? "chip-muted"}`}
                    >
                      {row.callType}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
