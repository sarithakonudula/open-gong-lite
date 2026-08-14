"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MethodologyScorecard, Depth } from "@/lib/methodology";
import {
  contextFlagLabel,
  DEPTH_LABEL,
  DEPTH_UNBACKED_LABEL,
  rigorLine,
  scorecardBackedFraction,
} from "@/lib/labels";
import type { RunRecord } from "@/lib/types";

const DEPTH_BADGE: Record<Depth, { label: string; className: string }> = {
  mastery: { label: DEPTH_LABEL.mastery, className: "badge-verified" },
  developing: { label: DEPTH_LABEL.developing, className: "badge-corrected" },
  surface: { label: DEPTH_LABEL.surface, className: "badge-unproven" },
  missing: { label: DEPTH_LABEL.missing, className: "badge-blocked" },
  not_applicable: {
    label: DEPTH_LABEL.not_applicable,
    className: "badge-corrected",
  },
};

function reportMarkdown(card: MethodologyScorecard): string {
  const lines: string[] = [];
  lines.push(`# ${card.pack.name} scorecard`);
  lines.push("");
  lines.push(
    `Score: ${card.score} out of 100 · call type: ${card.callType} · ${rigorLine(card.band)} · ${scorecardBackedFraction(card.evidenceStats)}`,
  );
  if (card.contextFlags.length > 0) {
    lines.push(`Read this against: ${card.contextFlags.map(contextFlagLabel).join(", ")}`);
  }
  if (card.overallNote) {
    lines.push("");
    lines.push(card.overallNote);
  }
  lines.push("");
  for (const row of card.traits.filter((r) => r.inScope)) {
    const depth = row.verdict
      ? DEPTH_LABEL[row.verdict.effectiveDepth]
      : "not assessed";
    lines.push(`- ${row.trait.name}: ${depth}`);
  }
  return lines.join("\n");
}

export function MethodologyScorecardView({
  run,
  initialCard,
  llmAvailable,
  packs,
  defaultPackId,
  detectedKind,
}: {
  run: RunRecord;
  initialCard: MethodologyScorecard | null;
  llmAvailable: boolean;
  packs: Array<{ id: string; name: string }>;
  defaultPackId?: string;
  detectedKind?: string;
}) {
  const [card, setCard] = useState<MethodologyScorecard | null>(initialCard);
  const [packId, setPackId] = useState(
    initialCard?.pack.id ?? defaultPackId ?? "meddic",
  );
  const [dealValue, setDealValue] = useState(
    initialCard?.dealValueUsd != null ? String(initialCard.dealValueUsd) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canPlayAudio = Boolean(run.audioContentType);

  // Sync from the server-provided card without an effect (adjust-during-render
  // pattern from react.dev/learn/you-might-not-need-an-effect).
  const [prevInitialCard, setPrevInitialCard] = useState(initialCard);
  if (initialCard !== prevInitialCard) {
    setPrevInitialCard(initialCard);
    setCard(initialCard);
  }

  useEffect(() => {
    if (!activeLineId) return;
    const el = document.getElementById(`score-line-${activeLineId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineId]);

  function jumpToLine(lineId: string) {
    setActiveLineId(lineId);
    if (!canPlayAudio || !audioRef.current) return;
    const line = run.transcript.find((l) => l.id === lineId);
    if (line?.startMs == null) return;
    const audio = audioRef.current;
    const seek = () => {
      audio.currentTime = line.startMs! / 1000;
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= 1) seek();
    else audio.addEventListener("loadedmetadata", seek, { once: true });
  }

  async function copyReport() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(reportMarkdown(card));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function scoreWithLlm() {
    setBusy(true);
    setError(null);
    try {
      const parsedDeal = dealValue.trim() === "" ? null : Number(dealValue);
      if (parsedDeal != null && (!Number.isFinite(parsedDeal) || parsedDeal < 0)) {
        setError("Deal value must be a non-negative number.");
        return;
      }
      const response = await fetch(`/api/runs/${run.id}/methodology`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId,
          dealValueUsd: parsedDeal,
        }),
      });
      const data = (await response.json()) as {
        card?: MethodologyScorecard;
        error?: string;
      };
      if (!response.ok || !data.card) {
        setError(data.error || "Scoring failed.");
        return;
      }
      setCard(data.card);
    } catch {
      setError("Scoring failed.");
    } finally {
      setBusy(false);
    }
  }

  const inScope = useMemo(
    () => card?.traits.filter((t) => t.inScope) ?? [],
    [card],
  );
  const outOfScope = useMemo(
    () => card?.traits.filter((t) => !t.inScope) ?? [],
    [card],
  );
  const gaps = useMemo(
    () =>
      inScope.filter(
        (r) =>
          r.verdict &&
          (r.verdict.effectiveDepth === "missing" ||
            r.verdict.effectiveDepth === "surface" ||
            r.verdict.unverified),
      ),
    [inScope],
  );

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
      <div className="space-y-8">
        <header className="space-y-4 animate-rise">
          <p className="text-xs uppercase tracking-[0.22em] text-signal">
            Methodology coach
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight md:text-5xl">
            {card ? `${card.pack.name} scorecard` : "Score this call"}
          </h1>
          <p className="max-w-2xl text-base text-fog/85">
            How deeply the call went, not how much was said. Every line of
            this scorecard needs a quote the transcript can re-find, checked
            the same way the notes are. What a call this size had no reason to
            reach is shown but never counted against the score.
          </p>
          {card && (
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-signal/25 bg-signal/10 px-4 py-3">
                <p className="text-2xl font-semibold text-signal">{card.score}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-mist">
                  / 100
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-ink-soft/55 px-4 py-3">
                <p className="text-2xl font-semibold text-paper">
                  {card.evidenceStats.corroborated} of {card.evidenceStats.total}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-mist">
                  backed by the call
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-ink-soft/55 px-4 py-3">
                <p className="text-lg font-semibold text-paper capitalize">
                  {card.callType}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-mist">
                  call type
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-ink-soft/55 px-4 py-3">
                <p className="text-lg font-semibold text-paper">
                  {card.band?.label ?? "Full pack"}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-mist">
                  measured as
                </p>
              </div>
            </div>
          )}
        </header>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-ink-soft/55 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-mist">
            Live score
            {detectedKind ? (
              <span className="ml-2 normal-case tracking-normal text-signal">
                detected: {detectedKind} call
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[10rem] flex-1 text-sm text-mist">
              Pack
              <select
                className="field mt-1"
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                disabled={busy}
              >
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-40 text-sm text-mist">
              Deal value (USD)
              <input
                className="field mt-1"
                inputMode="numeric"
                placeholder="optional"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                disabled={busy}
              />
            </label>
            {llmAvailable ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void scoreWithLlm()}
              >
                {busy ? "Scoring…" : "Score with LLM"}
              </button>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center rounded-full border border-mist/40 px-5 py-2.5 text-sm text-mist"
                title="Set LLM_BASE_URL and LLM_API_KEY, then restart"
              >
                LLM scoring off
              </span>
            )}
            {card && (
              <button type="button" className="btn-ghost" onClick={() => void copyReport()}>
                {copied ? "Copied" : "Copy report"}
              </button>
            )}
          </div>
          {!llmAvailable && (
            <p className="text-sm text-mist">
              Scoring a new call needs a language model, which is off right
              now (set LLM_BASE_URL and LLM_API_KEY). Brightsmile 1 · Discovery
              ships with its scorecard already made, so it works with no keys.
            </p>
          )}
          {error && <p className="text-sm text-heat">{error}</p>}
        </section>

        {!card ? (
          <p className="text-mist animate-rise-delay">
            This call has not been scored yet. Brightsmile 1 · Discovery ships
            with its scorecard already made and needs no keys. Any other call
            can be scored once a language model is configured.
          </p>
        ) : (
          <div className="space-y-10 animate-rise-delay">
            {card.contextFlags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {card.contextFlags.map((flag) => (
                  <span key={flag} className="badge-corrected">
                    {contextFlagLabel(flag)}
                  </span>
                ))}
              </div>
            )}
            {card.overallNote && (
              <p className="text-[1.05rem] leading-relaxed text-paper/95">
                {card.overallNote}
              </p>
            )}

            <section className="space-y-4">
              <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                Scored traits
              </h3>
              <ul className="space-y-5">
                {inScope.map((row) => {
                  const depth = row.verdict?.effectiveDepth ?? "not_applicable";
                  const badge = DEPTH_BADGE[depth];
                  return (
                    <li key={row.trait.id} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={badge.className}>{badge.label}</span>
                        <span className="text-xs uppercase tracking-[0.14em] text-mist">
                          weight {row.trait.weight}
                          {row.points != null ? ` · ${row.points}/3` : ""}
                        </span>
                        {row.verdict?.unverified && (
                          <span className="badge-unproven">
                            {DEPTH_UNBACKED_LABEL}
                          </span>
                        )}
                      </div>
                      <p className="text-[1.05rem] text-paper/95">{row.trait.name}</p>
                      {row.verdict?.gap ? (
                        <p className="text-sm text-fog/80">{row.verdict.gap}</p>
                      ) : null}
                      {row.verdict?.gatedEvidence.map((ev, i) => (
                        <button
                          key={`${ev.lineId}-${i}`}
                          type="button"
                          className={`receipt-link block text-sm ${
                            ev.status === "uncorroborated"
                              ? "text-heat"
                              : ""
                          }`}
                          onClick={() => jumpToLine(ev.lineId)}
                        >
                          {ev.status === "uncorroborated"
                            ? "Quote the AI offered"
                            : "Source"}{" "}
                          · {ev.lineId}: “{ev.quote}”
                        </button>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </section>

            {outOfScope.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                  Not scored at this deal size
                </h3>
                <p className="text-sm text-mist">
                  Shown so nothing is hidden, but left out of the score. A low
                  mark here would mislead on a{" "}
                  {card.band?.label ?? "smaller"} deal.
                </p>
                <ul className="space-y-3">
                  {outOfScope.map((row) => {
                    const depth = row.verdict?.effectiveDepth ?? "not_applicable";
                    const badge = DEPTH_BADGE[depth];
                    return (
                      <li key={row.trait.id} className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={badge.className}>{badge.label}</span>
                          <span className="text-paper/90">{row.trait.name}</span>
                          <span className="text-xs text-mist">{row.trait.rigor}</span>
                        </div>
                        {row.verdict?.gap ? (
                          <p className="text-sm text-fog/80">{row.verdict.gap}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="space-y-4">
              <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                Coaching
              </h3>
              {gaps.length === 0 ? (
                <p className="text-mist">
                  Everything scored here was at least explored, and every line
                  of it is backed by the call.
                </p>
              ) : (
                <ul className="space-y-5">
                  {gaps
                    .slice()
                    .sort((a, b) => b.trait.weight - a.trait.weight)
                    .map((row) => (
                      <li key={row.trait.id} className="space-y-2">
                        <p className="text-paper/95">{row.trait.name}</p>
                        <p className="text-sm text-fog/85">
                          Next move: {row.trait.coaching.next_move}
                        </p>
                        <p className="text-sm text-mist">
                          Try saying: “{row.trait.coaching.example_line}”
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <aside className="animate-rise-delay-2">
        <div className="sticky top-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-ink-soft/80">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-mist">
              Transcript
            </p>
            <p className="mt-1 text-sm text-fog/80">
              Click a Source to jump to the line it came from.
            </p>
            {canPlayAudio && (
              <audio
                ref={audioRef}
                className="mt-3 w-full"
                controls
                preload="metadata"
                src={`/api/runs/${run.id}/audio`}
              />
            )}
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto p-3">
            {run.transcript.map((line) => {
              const active = activeLineId === line.id;
              return (
                <button
                  key={line.id}
                  id={`score-line-${line.id}`}
                  type="button"
                  onClick={() => jumpToLine(line.id)}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${
                    active ? "line-active" : "hover:bg-white/5"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-mist">
                    <span>{line.id}</span>
                    <span>·</span>
                    <span>{line.speaker}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-paper/90">{line.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
