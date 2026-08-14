"use client";

import { useState } from "react";
import Link from "next/link";

export type RepTrait = {
  traitId: string;
  name: string;
  history: Array<number | null>;
  avg: number | null;
  trend: number | null;
  status: "strength" | "developing" | "gap";
};

export type RepCard = {
  rep: string;
  callCount: number;
  latestScore: number | null;
  scoreTrend: number | null;
  strength: { name: string; detail: string } | null;
  improvement: {
    name: string;
    priority: "High priority" | "Medium priority" | "Low priority";
    priorityClass: string;
    tip: string | null;
    yourMoment: { quote: string; lineId: string; runId: string } | null;
  } | null;
  traits: RepTrait[];
};

const TILE_COLORS = [
  "bg-brand-soft text-brand",
  "bg-positive-soft text-positive",
  "bg-warn-soft text-warn",
  "bg-info-soft text-info",
  "bg-danger-soft text-danger",
];

function tileColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-fg-soft";
  if (score >= 80) return "text-positive";
  if (score >= 60) return "text-warn";
  return "text-danger";
}

const STATUS_CHIP: Record<RepTrait["status"], string> = {
  strength: "chip-positive",
  developing: "chip-warn",
  gap: "chip-risk",
};

function Sparkline({ history }: { history: Array<number | null> }) {
  const BAR = ["▁", "▃", "▅", "█"];
  return (
    <span className="font-mono text-sm tracking-widest text-fg-muted">
      {history.map((p, i) => (
        <span key={i}>{p == null ? "·" : (BAR[p] ?? "·")}</span>
      ))}
    </span>
  );
}

function trendArrow(trend: number | null): string {
  if (trend == null || trend === 0) return "→";
  return trend > 0 ? "↑" : "↓";
}

type Ask = { label: string; answer: string };

export function RepsClient({ cards, asks }: { cards: RepCard[]; asks: Ask[] }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [openRep, setOpenRep] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Reps</h1>
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">
            No scored calls yet
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Run Brightsmile 1 · Discovery from Upload (it ships with an offline
            scorecard), or score any run on its Scorecard tab — every score
            feeds a rep&rsquo;s card here.
          </p>
          <Link href="/" className="btn-primary mt-5 inline-flex text-sm">
            Go to Upload
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Reps</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {asks.map((ask) => (
          <button
            key={ask.label}
            type="button"
            className="chip chip-brand cursor-pointer !py-1.5 transition hover:brightness-95"
            onClick={() => setAnswer(ask.answer)}
          >
            {ask.label}
          </button>
        ))}
      </div>
      {answer && (
        <div className="card mt-3 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
            Computed from scorecards
          </p>
          <p className="mt-1 text-sm text-fg">{answer}</p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {cards.map((card) => (
          <section key={card.rep} className="card p-5">
            <div className="flex flex-wrap gap-5">
              <div className="flex min-w-44 items-start gap-3">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-[14px] font-bold ${tileColor(card.rep)}`}
                >
                  {initials(card.rep) || "?"}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-fg">{card.rep}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-muted">
                    Rep <span className="chip chip-muted">inferred</span>
                  </p>
                  <p className="mt-1 text-[12px] text-fg-soft">
                    {card.callCount} scored call{card.callCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="min-w-20">
                <p
                  className={`text-3xl font-bold tabular-nums ${scoreColor(card.latestScore)}`}
                >
                  {card.latestScore != null ? `${card.latestScore}%` : "—"}
                </p>
                <div
                  className={`mt-1 h-1 w-14 rounded-full ${
                    card.latestScore == null
                      ? "bg-edge"
                      : card.latestScore >= 80
                        ? "bg-positive"
                        : card.latestScore >= 60
                          ? "bg-warn"
                          : "bg-danger"
                  }`}
                />
              </div>

              <div className="min-w-56 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-positive">
                  ✓ Strength
                </p>
                {card.strength ? (
                  <p className="mt-1 text-sm text-fg">
                    <span className="font-medium">{card.strength.name}.</span>{" "}
                    {card.strength.detail}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-fg-soft">
                    Not enough scored calls yet.
                  </p>
                )}
              </div>

              <div className="min-w-56 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-warn">
                  ⚠ Improvement
                </p>
                {card.improvement ? (
                  <div className="mt-1">
                    <p className="text-sm text-fg">
                      <span className="font-medium">
                        {card.improvement.name}
                      </span>
                    </p>
                    <span className={`chip mt-1.5 ${card.improvement.priorityClass}`}>
                      {card.improvement.priority}
                    </span>
                    {card.improvement.tip && (
                      <p className="mt-1.5 text-[13px] text-fg-muted">
                        {card.improvement.tip}
                      </p>
                    )}
                    {card.improvement.yourMoment && (
                      <Link
                        href={`/runs/${card.improvement.yourMoment.runId}`}
                        className="receipt-link mt-1.5 block text-[12px]"
                      >
                        Your moment · {card.improvement.yourMoment.lineId}:
                        &ldquo;{card.improvement.yourMoment.quote.slice(0, 80)}
                        {card.improvement.yourMoment.quote.length > 80 ? "…" : ""}
                        &rdquo;
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-fg-soft">
                    Nothing flagged across scored calls.
                  </p>
                )}
              </div>
            </div>

            {card.traits.length > 0 && (
              <div className="mt-4 border-t border-edge pt-3">
                <button
                  type="button"
                  className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-soft hover:text-fg"
                  onClick={() =>
                    setOpenRep(openRep === card.rep ? null : card.rep)
                  }
                >
                  {openRep === card.rep ? "▾ Hide" : "▸ Show"} trait trends
                </button>
                {openRep === card.rep && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-soft">
                          <th className="py-1.5 pr-4">Trait</th>
                          <th className="py-1.5 pr-4">Trend</th>
                          <th className="py-1.5 pr-4">Avg</th>
                          <th className="py-1.5 pr-4">History</th>
                          <th className="py-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.traits.map((trait) => (
                          <tr key={trait.traitId} className="border-t border-edge">
                            <td className="py-2 pr-4 font-medium text-fg">
                              {trait.name}
                            </td>
                            <td className="py-2 pr-4 text-fg-muted">
                              {trendArrow(trait.trend)}
                            </td>
                            <td className="py-2 pr-4 tabular-nums text-fg-muted">
                              {trait.avg != null ? trait.avg.toFixed(1) : "—"}
                            </td>
                            <td className="py-2 pr-4">
                              <Sparkline history={trait.history} />
                            </td>
                            <td className="py-2">
                              <span className={`chip ${STATUS_CHIP[trait.status]}`}>
                                {trait.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
