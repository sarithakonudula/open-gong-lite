"use client";

import { useMemo, useState } from "react";
import type {
  MethodologyScorecard,
  Depth,
  ScoredTrait,
} from "@/lib/methodology";
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

function TraitAccordion({
  row,
  coaching = false,
  defaultOpen = false,
  onSource,
}: {
  row: ScoredTrait;
  coaching?: boolean;
  defaultOpen?: boolean;
  onSource?: (lineId: string) => void;
}) {
  const depth = row.verdict?.effectiveDepth ?? "not_applicable";
  const badge = DEPTH_BADGE[depth];
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group overflow-hidden rounded-2xl border border-edge bg-surface open:border-brand/35 open:shadow-[0_14px_35px_rgba(25,61,110,0.08)]"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden hover:bg-canvas/70">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={badge.className}>{badge.label}</span>
            {row.verdict?.unverified && (
              <span className="badge-unproven">{DEPTH_UNBACKED_LABEL}</span>
            )}
          </div>
          <p className="truncate text-[15px] font-semibold text-fg">
            {row.trait.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs uppercase tracking-[0.12em] text-fg-soft">
            weight {row.trait.weight}
            {row.points != null ? ` · ${row.points}/3` : ""}
          </span>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-edge text-lg text-fg-muted transition group-open:rotate-180 group-open:border-brand/30 group-open:text-brand"
          >
            ⌄
          </span>
        </div>
      </summary>

      <div className="space-y-4 border-t border-edge bg-canvas/40 px-5 py-5">
        {row.verdict?.gap && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-soft">
              Assessment
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
              {row.verdict.gap}
            </p>
          </div>
        )}

        {coaching && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-edge bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                Next move
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg">
                {row.trait.coaching.next_move}
              </p>
            </div>
            <div className="rounded-xl border border-edge bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                Try saying
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg">
                “{row.trait.coaching.example_line}”
              </p>
            </div>
          </div>
        )}

        {row.verdict?.gatedEvidence.length ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-soft">
              Sources
            </p>
            <div className="mt-2 space-y-2">
              {row.verdict.gatedEvidence.map((ev, index) => (
                <button
                  key={`${ev.lineId}-${index}`}
                  type="button"
                  className={`block w-full rounded-xl border border-edge bg-surface px-3 py-2.5 text-left text-sm leading-relaxed transition hover:border-brand/35 hover:text-brand ${
                    ev.status === "uncorroborated" ? "text-danger" : "text-fg-muted"
                  }`}
                  onClick={() => onSource?.(ev.lineId)}
                >
                  “{ev.quote}”
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-soft">
            No source was captured for this criterion.
          </p>
        )}
      </div>
    </details>
  );
}

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
  onSource,
}: {
  run: RunRecord;
  initialCard: MethodologyScorecard | null;
  llmAvailable: boolean;
  packs: Array<{ id: string; name: string }>;
  defaultPackId?: string;
  detectedKind?: string;
  /** Jump to the transcript moment for a source quote. */
  onSource?: (lineId: string) => void;
}) {
  const [packId, setPackId] = useState(
    initialCard?.pack.id ?? defaultPackId ?? "meddic",
  );
  const [cardsByPack, setCardsByPack] = useState<
    Record<string, MethodologyScorecard>
  >(() => (initialCard ? { [initialCard.pack.id]: initialCard } : {}));
  const [activeTraitId, setActiveTraitId] = useState<string | null>(
    initialCard?.traits.find((row) => row.inScope)?.trait.id ??
      initialCard?.traits[0]?.trait.id ??
      null,
  );
  const [dealValue, setDealValue] = useState(
    initialCard?.dealValueUsd != null ? String(initialCard.dealValueUsd) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const card = cardsByPack[packId] ?? null;

  // Sync from the server-provided card without an effect (adjust-during-render
  // pattern from react.dev/learn/you-might-not-need-an-effect).
  const [prevInitialCard, setPrevInitialCard] = useState(initialCard);
  if (initialCard !== prevInitialCard) {
    setPrevInitialCard(initialCard);
    if (initialCard) {
      setCardsByPack((current) => ({
        ...current,
        [initialCard.pack.id]: initialCard,
      }));
      setPackId(initialCard.pack.id);
      setActiveTraitId(
        initialCard.traits.find((row) => row.inScope)?.trait.id ??
          initialCard.traits[0]?.trait.id ??
          null,
      );
    }
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
      setCardsByPack((current) => ({
        ...current,
        [data.card!.pack.id]: data.card!,
      }));
      setPackId(data.card.pack.id);
      setActiveTraitId(
        data.card.traits.find((row) => row.inScope)?.trait.id ??
          data.card.traits[0]?.trait.id ??
          null,
      );
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
  const activeTrait = useMemo(
    () =>
      card?.traits.find((row) => row.trait.id === activeTraitId) ??
      card?.traits.find((row) => row.inScope) ??
      card?.traits[0] ??
      null,
    [activeTraitId, card],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-5 py-8 lg:px-8">
      <header className="space-y-4 animate-rise">
          <p className="text-xs uppercase tracking-[0.22em] text-brand">
            Methodology coach
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight md:text-5xl">
            {card ? `${card.pack.name} scorecard` : "Score this call"}
          </h1>
          <p className="max-w-2xl text-base text-fg-muted">
            How deeply the call went, not how much was said. Every line of
            this scorecard needs a quote the transcript can re-find, checked
            the same way the notes are. What a call this size had no reason to
            reach is shown but never counted against the score.
          </p>
          {card && (
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-brand/25 bg-signal/10 px-4 py-3">
                <p className="text-2xl font-semibold text-brand">{card.score}</p>
                <p className="text-xs uppercase tracking-[0.14em] text-fg-soft">
                  / 100
                </p>
              </div>
              <div className="rounded-2xl border border-edge bg-surface px-4 py-3">
                <p className="text-2xl font-semibold text-fg">
                  {inScope.filter((row) => (row.points ?? 0) > 0).length} of{" "}
                  {inScope.length}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-fg-soft">
                  criteria explored
                </p>
              </div>
              <div className="rounded-2xl border border-edge bg-surface px-4 py-3">
                <p className="text-lg font-semibold text-fg capitalize">
                  {card.callType}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-fg-soft">
                  call type
                </p>
              </div>
              <div className="rounded-2xl border border-edge bg-surface px-4 py-3">
                <p className="text-lg font-semibold text-fg">
                  {card.band?.label ?? "Full pack"}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-fg-soft">
                  measured as
                </p>
              </div>
            </div>
          )}
        </header>

        <section className="overflow-hidden rounded-2xl border border-edge bg-canvas">
          <div className="space-y-3 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-fg-soft">
            Score this methodology
            {detectedKind ? (
              <span className="ml-2 normal-case tracking-normal text-brand">
                detected: {detectedKind} call
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-sm text-fg-soft">
              Methodology
              <select
                className="field mt-1"
                value={packId}
                onChange={(event) => {
                  setPackId(event.target.value);
                  setActiveTraitId(null);
                }}
                disabled={busy}
              >
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-40 text-sm text-fg-soft">
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
                className="inline-flex cursor-not-allowed items-center rounded-full border border-edge/40 px-5 py-2.5 text-sm text-fg-soft"
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
            <p className="text-sm text-fg-soft">
              Scoring a new call needs a language model, which is off right
              now (set LLM_BASE_URL and LLM_API_KEY). Brightsmile 1 · Discovery
              ships with its scorecard already made, so it works with no keys.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </section>

        {!card ? (
          <p className="text-fg-soft animate-rise-delay">
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
              <p className="text-[1.05rem] leading-relaxed text-fg">
                {card.overallNote}
              </p>
            )}

            <section className="space-y-5">
              <div className="overflow-x-auto border-b border-edge">
                <div
                  className="flex min-w-max gap-7"
                  role="tablist"
                  aria-label={`${card.pack.name} scorecard sections`}
                >
                  {card.traits.map((row) => (
                    <button
                      key={row.trait.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTrait?.trait.id === row.trait.id}
                      onClick={() => setActiveTraitId(row.trait.id)}
                      className={`border-b-2 pb-3 text-sm font-semibold transition ${
                        activeTrait?.trait.id === row.trait.id
                          ? "border-brand text-brand"
                          : "border-transparent text-fg-muted hover:text-fg"
                      }`}
                    >
                      {row.trait.name}
                      {!row.inScope && (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-fg-soft">
                          Not scored
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {activeTrait && (
                <div
                  role="tabpanel"
                  aria-label={activeTrait.trait.name}
                  className="space-y-3"
                >
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {activeTrait.trait.definition}
                  </p>
                  {!activeTrait.inScope && (
                    <p className="rounded-xl border border-edge bg-canvas px-4 py-3 text-sm text-fg-soft">
                      This section is shown for context but does not affect the
                      score at this deal size.
                    </p>
                  )}
                  <TraitAccordion
                    key={activeTrait.trait.id}
                    row={activeTrait}
                    coaching
                    defaultOpen
                    onSource={onSource}
                  />
                </div>
              )}
            </section>
          </div>
        )}
    </div>
  );
}
