"use client";

import { useEffect, useMemo, useState } from "react";
import type { Claim, RunRecord } from "@/lib/types";

function ClaimList({
  title,
  claims,
  onReceipt,
}: {
  title: string;
  claims: Claim[];
  onReceipt: (lineId: string) => void;
}) {
  if (!claims.length) {
    return (
      <section className="space-y-3">
        <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
          {title}
        </h3>
        <p className="text-mist text-sm">None captured.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
        {title}
      </h3>
      <ul className="space-y-4">
        {claims.map((claim, index) => (
          <li key={`${title}-${index}`} className="space-y-2">
            <p className="text-[1.05rem] leading-relaxed text-paper/95">
              {claim.text}
            </p>
            <button
              type="button"
              className="receipt-link text-sm"
              onClick={() => onReceipt(claim.evidence.lineId)}
            >
              Receipt · {claim.evidence.lineId}: “{claim.evidence.quote}”
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DealNotesView({
  run,
  shareMode = false,
}: {
  run: RunRecord;
  shareMode?: boolean;
}) {
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeLineId) return;
    const el = document.getElementById(`line-${activeLineId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineId]);

  const statusTone = useMemo(() => {
    if (run.status === "shipped") return "text-signal";
    if (run.status === "partial") return "text-heat";
    if (run.status === "failed") return "text-heat";
    return "text-mist";
  }, [run.status]);

  const gateFailures = useMemo(() => {
    return run.attempts
      .filter((a) => !a.ok)
      .flatMap((a) =>
        a.failures.map((f) => ({
          attempt: a.attempt,
          code: f.code,
          message: f.message,
          path: f.path,
        })),
      );
  }, [run.attempts]);

  const notes = run.notes;
  const intelCounts = notes
    ? [
        { label: "Summary", value: notes.summary.length },
        { label: "Objections", value: notes.objections.length },
        { label: "Intent", value: notes.intent.length },
        { label: "Next steps", value: notes.nextSteps.length },
      ]
    : [];

  async function copyShareLink() {
    const url = `${window.location.origin}/share/${run.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
      <div className="space-y-8">
        <header className="space-y-4 animate-rise">
          <p className="text-xs uppercase tracking-[0.22em] text-signal">
            Deal intelligence
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight md:text-5xl">
            {notes?.title || run.sourceLabel}
          </h1>
          <p className="max-w-2xl text-base text-fog/85">
            This page <span className="text-paper">is</span> the deal
            intelligence: summary, objections, intent, next steps, and a
            follow-up email. Click any green{" "}
            <span className="text-signal">Receipt</span> to jump to proof in the
            transcript on the right.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-mist">
            <span className={statusTone}>Status: {run.status}</span>
            <span>·</span>
            <span>{run.sourceLabel}</span>
            {!shareMode && (
              <>
                <span>·</span>
                <a className="receipt-link" href={`/share/${run.shareToken}`}>
                  Share link
                </a>
                <button
                  type="button"
                  className="receipt-link"
                  onClick={copyShareLink}
                >
                  {copied ? "Copied" : "Copy share URL"}
                </button>
                <a
                  className="receipt-link"
                  href={`/api/runs/${run.id}/export?format=md`}
                >
                  Export MD
                </a>
                <a
                  className="receipt-link"
                  href={`/api/runs/${run.id}/export?format=json`}
                >
                  Export JSON
                </a>
              </>
            )}
          </div>

          {run.status !== "shipped" && (
            <div className="rounded-2xl border border-heat/40 bg-heat/10 px-4 py-3 text-sm text-paper">
              <p className="font-medium text-heat">
                Harness did not clean-ship this run ({run.status})
              </p>
              <p className="mt-1 text-fog/85">
                {run.error ||
                  "See gate failures below — unproven claims never silently appear as facts."}
              </p>
              {gateFailures.length > 0 && (
                <ul className="mt-3 space-y-1 text-fog/80">
                  {gateFailures.slice(0, 6).map((f, i) => (
                    <li key={`${f.attempt}-${f.code}-${i}`}>
                      Attempt #{f.attempt} · {f.code}
                      {f.path ? ` @ ${f.path}` : ""} — {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {intelCounts.length > 0 && (
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
              {intelCounts.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-signal/25 bg-signal/10 px-4 py-3"
                >
                  <p className="text-2xl font-semibold text-signal">
                    {item.value}
                  </p>
                  <p className="text-xs uppercase tracking-[0.14em] text-mist">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </header>

        {notes ? (
          <div className="space-y-10 animate-rise-delay">
            <ClaimList
              title="1 · Summary"
              claims={notes.summary}
              onReceipt={setActiveLineId}
            />
            <ClaimList
              title="2 · Objections"
              claims={notes.objections}
              onReceipt={setActiveLineId}
            />
            <ClaimList
              title="3 · Intent"
              claims={notes.intent}
              onReceipt={setActiveLineId}
            />
            <ClaimList
              title="4 · Next steps"
              claims={notes.nextSteps}
              onReceipt={setActiveLineId}
            />
            <section className="space-y-3">
              <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                5 · Follow-up email
              </h3>
              <p className="text-sm text-mist">
                Subject: {notes.followUpEmail.subject}
              </p>
              <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-ink-soft/70 p-4 text-sm leading-relaxed text-paper/90">
                {notes.followUpEmail.body}
              </pre>
              <button
                type="button"
                className="receipt-link text-sm"
                onClick={() =>
                  setActiveLineId(notes.followUpEmail.evidence.lineId)
                }
              >
                Receipt · {notes.followUpEmail.evidence.lineId}: “
                {notes.followUpEmail.evidence.quote}”
              </button>
            </section>
          </div>
        ) : (
          <p className="text-mist animate-rise-delay">
            {run.error || "Deal intelligence did not ship for this run."}
          </p>
        )}

        {run.attempts.length > 0 && (
          <section className="space-y-3 border-t border-white/10 pt-6 animate-rise-delay-2">
            <h3 className="text-sm uppercase tracking-[0.18em] text-mist">
              Harness attempts
            </h3>
            <ul className="space-y-2 text-sm text-fog/80">
              {run.attempts.map((attempt) => (
                <li key={attempt.attempt}>
                  #{attempt.attempt} · {attempt.ok ? "passed" : "blocked"} ·{" "}
                  {attempt.reason || "n/a"}
                  {attempt.failures[0]
                    ? ` — ${attempt.failures[0].message}`
                    : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="animate-rise-delay-2">
        <div className="sticky top-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-ink-soft/80">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-mist">
              Transcript
            </p>
            <p className="mt-1 text-sm text-fog/80">
              Click a receipt to jump to the exact line.
            </p>
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto p-3">
            {run.transcript.map((line) => {
              const active = activeLineId === line.id;
              return (
                <button
                  key={line.id}
                  id={`line-${line.id}`}
                  type="button"
                  onClick={() => setActiveLineId(line.id)}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${
                    active ? "line-active" : "hover:bg-white/5"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-mist">
                    <span>{line.id}</span>
                    <span>·</span>
                    <span>{line.speaker}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-paper/90">
                    {line.text}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
