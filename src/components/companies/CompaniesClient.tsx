"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateShort } from "@/lib/format";
import type { DealStateLabel } from "@/lib/sentiment";
import { dealStateChipClass } from "@/lib/sentiment";

export type CompanyClusterCall = {
  id: string;
  title: string;
  createdAt: string;
  score: number | null;
  dealState: DealStateLabel | null;
};

export type CompanyCluster = {
  company: string;
  callCount: number;
  callKindLabel: string;
  isSales: boolean;
  momentum: { score: number; direction: string } | null;
  dealState: DealStateLabel | null;
  latestAt: string;
  highlights: Array<{ text: string; lineId: string }>;
  nextSteps: string[];
  openObjections: string[];
  riskAlerts: Array<{ severity: string; title: string; play: string }>;
  calls: CompanyClusterCall[];
};

export type CompanyTotals = {
  companies: number;
  calls: number;
  advancing: number;
  steady: number;
  stalling: number;
  atRisk: number;
};

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

function initials(company: string): string {
  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const SEVERITY_CLASS: Record<string, string> = {
  hot: "chip-risk",
  high: "chip-warn",
  watch: "chip-neutral",
  info: "chip-muted",
};

export function CompaniesClient({
  clusters,
  totals,
}: {
  clusters: CompanyCluster[];
  totals: CompanyTotals;
}) {
  const [slackStatus, setSlackStatus] = useState<string | null>(null);

  async function sendToSlack() {
    setSlackStatus("Sending…");
    try {
      const response = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Send failed");
      setSlackStatus(data.sent ? "Sent to Slack ✅" : "Slack rejected the message");
    } catch (error) {
      setSlackStatus(error instanceof Error ? error.message : "Send failed");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Companies
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            {totals.companies} compan{totals.companies === 1 ? "y" : "ies"} ·{" "}
            {totals.calls} call{totals.calls === 1 ? "" : "s"} ·{" "}
            <span className="text-positive">{totals.advancing} advancing</span>{" "}
            · {totals.steady} steady ·{" "}
            <span className="text-warn">{totals.stalling} stalling</span> ·{" "}
            <span className="text-danger">{totals.atRisk} at risk</span>
          </p>
          <p className="mt-1 text-[12px] text-fg-soft">
            Deal-level view of every company&rsquo;s call cluster. Built only
            from gate-passed claims.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {slackStatus && (
            <span className="text-[13px] text-fg-muted">{slackStatus}</span>
          )}
          <button type="button" className="btn-primary text-sm" onClick={sendToSlack}>
            Send digest to Slack
          </button>
        </div>
      </div>

      {clusters.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">No companies yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Analyze a call and its company lands here with a deal-level
            summary, momentum, and risks.
          </p>
          <Link href="/" className="btn-primary mt-5 inline-flex text-sm">
            Go to Upload
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {clusters.map((cluster) => (
            <section key={cluster.company} className="card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-lg text-[13px] font-bold ${tileColor(cluster.company)}`}
                >
                  {initials(cluster.company) || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-fg">
                    {cluster.company}
                  </h2>
                  <p className="text-[13px] text-fg-muted">
                    {cluster.callCount} call{cluster.callCount === 1 ? "" : "s"} ·
                    latest {formatDateShort(cluster.latestAt)}
                  </p>
                </div>
                <div className="text-right">
                  {cluster.momentum ? (
                    <>
                      <p className="text-2xl font-bold tabular-nums text-fg">
                        {cluster.momentum.score}%
                      </p>
                      {cluster.dealState && (
                        <span
                          className={`chip ${dealStateChipClass(cluster.dealState)}`}
                        >
                          ● {cluster.dealState}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="chip chip-brand">{cluster.callKindLabel}</span>
                  )}
                </div>
              </div>

              {(cluster.highlights.length > 0 ||
                cluster.openObjections.length > 0 ||
                cluster.nextSteps.length > 0) && (
                <div className="mt-4 space-y-2 border-t border-edge pt-4">
                  {cluster.highlights.map((h, i) => (
                    <p key={`h-${i}`} className="text-sm text-fg">
                      {h.text}{" "}
                      <span className="text-[12px] text-fg-soft">[{h.lineId}]</span>
                    </p>
                  ))}
                  {cluster.openObjections.map((o, i) => (
                    <p key={`o-${i}`} className="text-sm text-warn">
                      ⚠ Open objection: {o}
                    </p>
                  ))}
                  {cluster.nextSteps.map((n, i) => (
                    <p key={`n-${i}`} className="text-sm text-fg-muted">
                      ➡️ {n}
                    </p>
                  ))}
                </div>
              )}

              {cluster.riskAlerts.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-edge pt-4">
                  {cluster.riskAlerts.map((alert, i) => (
                    <div key={`r-${i}`} className="rounded-lg bg-canvas px-3 py-2.5">
                      <p className="flex items-center gap-2 text-sm font-medium text-fg">
                        <span
                          className={`chip ${SEVERITY_CLASS[alert.severity] ?? "chip-muted"}`}
                        >
                          {alert.severity}
                        </span>
                        {alert.title}
                      </p>
                      <p className="mt-1 text-[13px] text-fg-muted">
                        What to do: {alert.play}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-edge pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
                  Calls in this cluster
                </p>
                <ul className="mt-2 divide-y divide-edge">
                  {cluster.calls.map((call) => (
                    <li key={call.id}>
                      <Link
                        href={`/runs/${call.id}`}
                        className="flex flex-wrap items-center gap-3 py-2 text-sm hover:bg-canvas/60"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-fg">
                          {call.title}
                        </span>
                        <span className="text-fg-muted">
                          {formatDateShort(call.createdAt)}
                        </span>
                        {call.score != null && (
                          <span className="font-semibold tabular-nums text-fg">
                            {call.score}%
                          </span>
                        )}
                        {call.dealState && (
                          <span
                            className={`chip ${dealStateChipClass(call.dealState)}`}
                          >
                            {call.dealState}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
