"use client";

import { useEffect, useState } from "react";

type DigestEntry = {
  company: string;
  callCount: number;
  momentum: { score: number; direction: string } | null;
  highlights: Array<{ text: string; lineId: string }>;
  nextSteps: string[];
  openObjections: string[];
  riskAlerts: Array<{ severity: string; title: string; play: string }>;
  latestRun: { id: string; createdAt: string; title: string };
};

type Digest = {
  generatedAt: string;
  totals: {
    companies: number;
    calls: number;
    advancing: number;
    steady: number;
    stalling: number;
    atRisk: number;
    hotAlerts: number;
  };
  entries: DigestEntry[];
  markdown: string;
};

const DIRECTION_STYLE: Record<string, string> = {
  advancing: "border-signal/60 text-signal",
  steady: "border-mist/50 text-fog",
  stalling: "border-heat/40 text-heat/90",
  at_risk: "border-heat/60 text-heat",
};

export function DigestClient() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/digest")
      .then((r) => r.json())
      .then((data) => setDigest(data.digest ?? null))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function sendToSlack() {
    setStatus("Sending…");
    try {
      const response = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Send failed");
      setStatus(data.sent ? "Sent to Slack ✅" : "Slack rejected the message");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Send failed");
    }
  }

  async function copyMarkdown() {
    if (!digest) return;
    await navigator.clipboard.writeText(digest.markdown);
    setStatus("Markdown copied");
  }

  if (loading) return <p className="text-sm text-mist">Building digest…</p>;
  if (!digest || digest.entries.length === 0) {
    return (
      <p className="text-sm text-mist">
        No analyzed calls yet — run a sample from the homepage and come back.
      </p>
    );
  }

  const t = digest.totals;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-fog">
          {t.companies} deals · {t.calls} calls · 🟢 {t.advancing} · 🟡 {t.steady} · 🟠 {t.stalling} · 🔴 {t.atRisk}
          {t.hotAlerts > 0 ? ` · 🔥 ${t.hotAlerts} hot` : ""}
        </p>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={copyMarkdown}>
            Copy markdown
          </button>
          <button className="btn-primary" onClick={sendToSlack}>
            Send to Slack
          </button>
        </div>
      </div>
      {status && <p className="text-sm text-fog">{status}</p>}

      <ul className="space-y-4">
        {digest.entries.map((e) => (
          <li key={e.company} className="rounded-xl border border-mist/25 bg-paper/40 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
                {e.company}
              </h2>
              {e.momentum && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs uppercase tracking-wide ${DIRECTION_STYLE[e.momentum.direction] ?? "border-mist/40 text-mist"}`}
                >
                  {e.momentum.direction.replace("_", " ")} · {e.momentum.score}/100
                </span>
              )}
              <span className="text-xs text-mist">
                {e.callCount} call{e.callCount === 1 ? "" : "s"} · latest{" "}
                {e.latestRun.createdAt.slice(0, 10)}
              </span>
              <a
                href={`/runs/${e.latestRun.id}`}
                className="ml-auto text-xs text-signal underline-offset-2 hover:underline"
              >
                open latest run →
              </a>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-fog/90">
              {e.highlights.map((h) => (
                <li key={h.lineId + h.text.slice(0, 12)}>
                  {h.text} <span className="text-xs text-mist">[{h.lineId}]</span>
                </li>
              ))}
              {e.openObjections.length > 0 && (
                <li className="text-heat/90">
                  ⚠️ Open objections: {e.openObjections.join(" · ")}
                </li>
              )}
              {e.riskAlerts.map((a) => (
                <li key={a.title} className="text-heat">
                  🚨 {a.title} — <span className="text-fog/90">{a.play}</span>
                </li>
              ))}
              {e.nextSteps.length > 0 && (
                <li className="text-signal">➡️ {e.nextSteps.join(" · ")}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-xs text-mist">
        Every bullet traces to a verified transcript line or a rule-evaluated
        signal — unproven claims never enter this digest.
      </p>
    </div>
  );
}
