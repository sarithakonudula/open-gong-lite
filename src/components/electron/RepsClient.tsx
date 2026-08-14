"use client";

import { useEffect, useState } from "react";
import { AskSearch } from "@/components/electron/AskSearch";

type Trait = { traitId: string; name: string; avg: number | null; status: string };
type Drill = {
  name: string;
  whyItMatters: string;
  nextMove: string;
  gap: string | null;
  yourMoment: { quote: string; lineId: string; runId: string } | null;
};
type Profile = {
  rep: string;
  calls: Array<{ runId: string; at: string; title: string; score: number }>;
  scoreTrend: number | null;
  strengths: Trait[];
  focus: Trait[];
  drills: Drill[];
};

const SUGGESTIONS = [
  "Who needs coaching this week?",
  "Who's improved the most this month?",
  "Compare focus areas across reps",
];

function priorityFor(trait: Trait | undefined): { label: string; style: string } {
  if (!trait || trait.avg == null || trait.avg < 1)
    return { label: "High priority", style: "bg-red-50 text-red-600" };
  if (trait.avg < 2.25)
    return { label: "Medium priority", style: "bg-orange-50 text-orange-600" };
  return { label: "Low priority", style: "bg-emerald-50 text-emerald-700" };
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-gray-900 border-emerald-500";
  if (score >= 60) return "text-gray-900 border-orange-400";
  return "text-gray-900 border-red-500";
}

export function RepsClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/coach")
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles ?? []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = profiles.filter((p) =>
    p.rep.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Reps</h1>

      <div className="mt-4">
        <AskSearch value={q} onChange={setQ} before="Search for a reps or" after="about your accounts" />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <span key={s} className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-600">
            {s}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {loading && <p className="text-sm text-gray-500">Building coaching profiles…</p>}
        {!loading && visible.length === 0 && (
          <p className="text-sm text-gray-500">
            No scored calls yet — run Brightsmile 1 from the classic homepage,
            or score any recording with an LLM. Every scorecard feeds this page.
          </p>
        )}
        {visible.map((p) => {
          const latest = p.calls[p.calls.length - 1];
          const score = latest?.score ?? 0;
          const strength = p.strengths[0];
          const drill = p.drills[0];
          const priority = priorityFor(p.focus[0]);
          return (
            <div key={p.rep} className="grid grid-cols-[220px_110px_1fr_1fr] gap-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-600">
                  {p.rep.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <span className="block font-bold">{p.rep}</span>
                  <span className="block text-sm text-gray-500">
                    {p.calls.length} scored call{p.calls.length === 1 ? "" : "s"}
                    {p.scoreTrend != null && (
                      <span className={p.scoreTrend >= 0 ? " text-emerald-600" : " text-red-500"}>
                        {" "}({p.scoreTrend >= 0 ? "+" : ""}{p.scoreTrend})
                      </span>
                    )}
                  </span>
                </span>
              </div>

              <div>
                <span className={`text-3xl font-bold ${scoreColor(score)}`}>{score}%</span>
                <div className={`mt-1 h-1 w-12 rounded-full ${score >= 75 ? "bg-emerald-500" : score >= 60 ? "bg-orange-400" : "bg-red-500"}`} />
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="m2.5 7.5 3 3 6-6.5"/></svg>
                  Strength
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                  {strength
                    ? `Consistent ${strength.name.toLowerCase()} across scored calls.`
                    : "Not enough scored calls to name a strength yet."}
                </p>
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-500">
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M7 1.5 13 12H1L7 1.5Z"/><path d="M7 6v2.8M7 10.6v.2"/></svg>
                  Improvement
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                  {drill ? drill.gap || `${drill.name}: ${drill.whyItMatters}` : "No focus area yet."}
                </p>
                {drill && (
                  <>
                    <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-medium ${priority.style}`}>
                      {priority.label}
                    </span>
                    <p className="mt-2 text-xs text-gray-500">{drill.nextMove}</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-gray-400">
        Scores are methodology scorecards over gated evidence; improvement areas
        quote the rep&rsquo;s own calls. Full drills with receipts live in{" "}
        <a href="/coach" className="text-indigo-500 underline">the coach view</a>.
      </p>
    </div>
  );
}
