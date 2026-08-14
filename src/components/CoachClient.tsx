"use client";

import { useEffect, useState } from "react";

type TraitProgress = {
  traitId: string;
  name: string;
  history: Array<number | null>;
  avg: number | null;
  trend: number | null;
  status: "strength" | "developing" | "gap";
};

type Drill = {
  traitId: string;
  name: string;
  whyItMatters: string;
  nextMove: string;
  exampleLine: string;
  yourMoment: { quote: string; lineId: string; runId: string } | null;
  gap: string | null;
};

type Profile = {
  rep: string;
  calls: Array<{ runId: string; at: string; title: string; score: number }>;
  scoreTrend: number | null;
  traits: TraitProgress[];
  strengths: TraitProgress[];
  focus: TraitProgress[];
  drills: Drill[];
};

const STATUS_STYLE: Record<TraitProgress["status"], string> = {
  strength: "border-signal/60 text-signal",
  developing: "border-mist/50 text-fog",
  gap: "border-heat/60 text-heat",
};

function Sparkline({ history }: { history: Array<number | null> }) {
  const BAR = ["▁", "▃", "▅", "█"];
  return (
    <span className="font-mono text-sm tracking-widest text-fog">
      {history
        .map((p) => (p == null ? "·" : (BAR[p] ?? "·")))
        .map((c, i) => (
          <span key={i}>{c}</span>
        ))}
    </span>
  );
}

export function CoachClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/coach")
      .then((r) => r.json())
      .then((data) => setProfiles(data.profiles ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-mist">Building coaching profiles…</p>;
  if (profiles.length === 0) {
    return (
      <p className="text-sm text-mist">
        No scored calls yet. Run Brightsmile 1 · Discovery from the homepage
        (ships with an offline scorecard), or score any run with an LLM on its
        Scorecard tab — each score feeds this loop.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {profiles.map((p) => {
        const latest = p.calls[p.calls.length - 1];
        return (
          <section key={p.rep}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                {p.rep}
              </h2>
              <span className="text-sm text-mist">
                {p.calls.length} scored call{p.calls.length === 1 ? "" : "s"}
                {latest ? ` · latest ${latest.score}/100` : ""}
                {p.scoreTrend != null
                  ? ` · trend ${p.scoreTrend >= 0 ? "+" : ""}${p.scoreTrend}`
                  : ""}
              </span>
            </div>

            {p.strengths.length > 0 && (
              <p className="mt-2 text-sm text-signal">
                Keep doing: {p.strengths.map((s) => s.name).join(" · ")}
              </p>
            )}

            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {p.traits
                .filter((t) => t.avg != null)
                .map((t) => (
                  <li
                    key={t.traitId}
                    className="flex items-center gap-3 rounded-lg border border-mist/20 bg-paper/30 px-3 py-2"
                  >
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_STYLE[t.status]}`}
                    >
                      {t.status}
                    </span>
                    <span className="text-sm text-fog/90">{t.name}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Sparkline history={t.history} />
                      {t.trend != null && (
                        <span className={`text-xs ${t.trend > 0 ? "text-signal" : t.trend < 0 ? "text-heat" : "text-mist"}`}>
                          {t.trend > 0 ? "▲" : t.trend < 0 ? "▼" : "—"}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>

            <div className="mt-6 space-y-4">
              {p.drills.map((d) => (
                <div key={d.traitId} className="rounded-xl border border-mist/25 bg-paper/40 p-5">
                  <h3 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
                    Focus: {d.name}
                  </h3>
                  <p className="mt-2 text-sm text-fog/90">{d.whyItMatters}</p>
                  {d.gap && (
                    <p className="mt-2 text-sm text-heat/90">This call&rsquo;s gap: {d.gap}</p>
                  )}
                  {d.yourMoment && (
                    <blockquote className="mt-3 border-l-2 border-heat/50 pl-3 text-sm italic text-mist">
                      What you said: &ldquo;{d.yourMoment.quote}&rdquo;{" "}
                      <a
                        href={`/runs/${d.yourMoment.runId}`}
                        className="not-italic text-xs text-signal underline-offset-2 hover:underline"
                      >
                        [{d.yourMoment.lineId}]
                      </a>
                    </blockquote>
                  )}
                  <p className="mt-3 text-sm text-fog">
                    <span className="font-medium text-foreground">Next move:</span>{" "}
                    {d.nextMove}
                  </p>
                  <blockquote className="mt-2 border-l-2 border-signal/50 pl-3 text-sm italic text-mist">
                    What mastery sounds like: &ldquo;{d.exampleLine}&rdquo;
                  </blockquote>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-mist">
        Drills pair each methodology pack&rsquo;s coaching content with the
        rep&rsquo;s own gate-passed quotes — receipts, not generic advice.
        Score more calls to sharpen the trend.
      </p>
    </div>
  );
}
