"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Entry = {
  company: string;
  callCount: number;
  callKind: string;
  momentum: { score: number; direction: string } | null;
  highlights: Array<{ text: string; lineId: string }>;
  nextSteps: string[];
  openObjections: string[];
  riskAlerts: Array<{ severity: string; title: string; play: string }>;
  latestRun: { id: string; createdAt: string; title: string };
};

const DIRECTION: Record<string, { label: string; style: string }> = {
  advancing: { label: "Positive", style: "bg-emerald-50 text-emerald-700" },
  steady: { label: "Neutral", style: "bg-indigo-50 text-indigo-600" },
  stalling: { label: "Neutral", style: "bg-indigo-50 text-indigo-600" },
  at_risk: { label: "At Risk", style: "bg-red-50 text-red-600" },
};

export function CompaniesClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/digest")
      .then((r) => r.json())
      .then((d) => setEntries(d.digest?.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
      <p className="mt-1 text-sm text-gray-500">
        Deal health per account — momentum, verified highlights, and open risks
        from the latest analyzed calls.
      </p>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {loading && <p className="text-sm text-gray-500">Loading companies…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-gray-500">
            No analyzed calls yet — <Link href="/upload" className="text-indigo-600 underline">upload one</Link> to get started.
          </p>
        )}
        {entries.map((e) => {
          const state = e.momentum
            ? DIRECTION[e.momentum.direction] ?? DIRECTION.steady!
            : { label: e.callKind === "sales" ? "Neutral" : e.callKind.replace("_", " "), style: "bg-gray-100 text-gray-600" };
          return (
            <div key={e.company} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-600">
                  {e.company.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1">
                  <span className="block font-bold">{e.company}</span>
                  <span className="block text-xs text-gray-500">
                    {e.callCount} call{e.callCount === 1 ? "" : "s"} · latest{" "}
                    {new Date(e.latestRun.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </span>
                {e.momentum && (
                  <span className="text-2xl font-bold">{e.momentum.score}%</span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.style}`}>
                  {state.label}
                </span>
              </div>

              <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
                {e.highlights.map((h) => (
                  <li key={h.lineId + h.text.slice(0, 10)} className="leading-relaxed">
                    {h.text}{" "}
                    <span className="text-xs text-gray-400">[{h.lineId}]</span>
                  </li>
                ))}
                {e.riskAlerts.slice(0, 2).map((a) => (
                  <li key={a.title} className="leading-relaxed text-red-600">
                    ⚠ {a.title} — <span className="text-gray-600">{a.play}</span>
                  </li>
                ))}
                {e.nextSteps.length > 0 && (
                  <li className="leading-relaxed text-indigo-600">
                    → {e.nextSteps.join(" · ")}
                  </li>
                )}
              </ul>

              <Link
                href={`/recordings/${e.latestRun.id}`}
                className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
              >
                Open latest call →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
