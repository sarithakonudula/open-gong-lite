"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Claim, ClaimStatus, RunRecord } from "@/lib/types";
import { isEmailableStatus } from "@/lib/types";
import {
  attemptReasonLine,
  backedFraction,
  COVERAGE_BAND_LABEL,
  linesCutLine,
  modelSourceLabel,
  NOTE_STATUS_LABEL,
  routedPanelTitle,
  RUN_STATUS_LABEL,
} from "@/lib/labels";

const BADGE_CLASS: Record<ClaimStatus, string> = {
  verified: "badge-verified",
  segment_corrected: "badge-corrected",
  uncorroborated: "badge-unproven",
  blocked_injection: "badge-blocked",
};

function claimStatus(claim: Claim): ClaimStatus {
  return claim.status ?? "verified";
}

function backedClaims(claims: Claim[]): Claim[] {
  return claims.filter((claim) => isEmailableStatus(claimStatus(claim)));
}

function NoteList({
  title,
  claims,
  onSource,
}: {
  title: string;
  claims: Claim[];
  onSource: (lineId: string) => void;
}) {
  const visibleClaims = backedClaims(claims);

  if (!visibleClaims.length) {
    return (
      <section className="space-y-3">
        <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
          {title}
        </h3>
        <p className="text-mist text-sm">Nothing on this in the call.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
        {title}
      </h3>
      <ul className="space-y-4">
        {visibleClaims.map((claim, index) => {
          const status = claimStatus(claim);
          return (
            <li
              key={claim.id || `${title}-${index}`}
              className="space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={BADGE_CLASS[status]}>
                  {NOTE_STATUS_LABEL[status]}
                </span>
              </div>
              <p className="text-[1.05rem] leading-relaxed text-paper/95">
                {claim.text}
              </p>
              <button
                type="button"
                className="receipt-link text-sm"
                onClick={() => onSource(claim.evidence.lineId)}
              >
                Source · {claim.evidence.lineId}: “{claim.evidence.quote}”
              </button>
            </li>
          );
        })}
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canPlayAudio = Boolean(run.audioContentType) && !shareMode;

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

  const notes = run.notes;
  const coverage = notes?.coverage;
  const allClaims = notes
    ? [
        ...notes.summary,
        ...notes.objections,
        ...notes.intent,
        ...notes.nextSteps,
        ...(notes.pain || []),
        ...(notes.pricing || []),
        ...(notes.competitors || []),
      ]
    : [];
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

  const intelCounts = notes
    ? [
        { label: "Summary", value: backedClaims(notes.summary).length },
        { label: "Objections", value: backedClaims(notes.objections).length },
        { label: "Intent", value: backedClaims(notes.intent).length },
        { label: "Next steps", value: backedClaims(notes.nextSteps).length },
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
            Notes from this call
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight md:text-5xl">
            {notes?.title || run.sourceLabel}
          </h1>
          <p className="max-w-2xl text-base text-fog/85">
            Every note below carries a citation to the moment it came from.
            Click a <span className="text-signal">Source</span>
            {canPlayAudio
              ? " to see that sentence in the call and hear that second."
              : " to see that sentence in the call."}{" "}
            Notes without transcript support are not displayed.
          </p>
          {coverage && (
            <p className="text-sm text-fog/90">
              <span className="text-signal">✓ {backedFraction(coverage)}</span>
              {coverage.stats.segment_corrected > 0 && (
                <>
                  {" · "}
                  {coverage.stats.segment_corrected} of those had the citation
                  corrected
                </>
              )}
              . Only transcript-backed notes are shown.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm text-mist">
            <span className={statusTone}>{RUN_STATUS_LABEL[run.status]}</span>
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
                {RUN_STATUS_LABEL[run.status]}
                {coverage ? `: ${COVERAGE_BAND_LABEL[coverage.band]}` : ""}
              </p>
              <p className="mt-1 text-fog/85">
                {run.error ||
                  "Only notes backed by the transcript are displayed."}
              </p>
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
            <NoteList
              title="1 · Summary"
              claims={notes.summary}
              onSource={jumpToLine}
            />
            <NoteList
              title="2 · Objections"
              claims={notes.objections}
              onSource={jumpToLine}
            />
            <NoteList
              title="3 · Intent"
              claims={notes.intent}
              onSource={jumpToLine}
            />
            <NoteList
              title="4 · Next steps"
              claims={notes.nextSteps}
              onSource={jumpToLine}
            />
            {(backedClaims(notes.pain || []).length > 0 ||
              backedClaims(notes.pricing || []).length > 0 ||
              backedClaims(notes.competitors || []).length > 0) && (
              <>
                <NoteList
                  title="Pain"
                  claims={notes.pain || []}
                  onSource={jumpToLine}
                />
                <NoteList
                  title="Pricing"
                  claims={notes.pricing || []}
                  onSource={jumpToLine}
                />
                <NoteList
                  title="Competitors"
                  claims={notes.competitors || []}
                  onSource={jumpToLine}
                />
              </>
            )}
            <section className="space-y-3">
              <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                5 · Follow-up email
              </h3>
              {!isEmailableStatus(notes.followUpEmail.status) ? (
                <p className="text-sm text-heat">
                  No transcript-backed follow-up email is available.
                </p>
              ) : (
                <>
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
                      jumpToLine(notes.followUpEmail.evidence.lineId)
                    }
                  >
                    Source · {notes.followUpEmail.evidence.lineId}: “
                    {notes.followUpEmail.evidence.quote}”
                  </button>
                </>
              )}
            </section>

            {notes.routedFollowUp && (
              <section className="space-y-3">
                <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                  6 · {routedPanelTitle(notes.routedFollowUp.template.short)}
                </h3>
                <p className="text-sm text-fog/85">
                  {notes.routedFollowUp.template.explainer}
                </p>
                <p className="text-sm text-mist">
                  Subject: {notes.routedFollowUp.subject}
                </p>
                <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-ink-soft/70 p-4 text-sm leading-relaxed text-paper/90">
                  {notes.routedFollowUp.body}
                </pre>
                <p className="text-sm text-mist">
                  From the template library · Template{" "}
                  {notes.routedFollowUp.template.id} · Written by{" "}
                  {notes.routedFollowUp.provenance.model}, which is{" "}
                  {modelSourceLabel(notes.routedFollowUp.provenance.source)} ·{" "}
                  {linesCutLine(
                    notes.routedFollowUp.provenance.cut,
                    notes.routedFollowUp.provenance.offTemplateCut,
                  )}
                </p>
                <ul className="space-y-2 text-sm text-fog/80">
                  {notes.routedFollowUp.bullets.map((bullet, index) => (
                    <li key={`${bullet.claimId}-${index}`}>
                      <button
                        type="button"
                        className="receipt-link"
                        data-claim={bullet.claimId}
                        onClick={() => {
                          const cited = allClaims.find(
                            (c) => (c.id || c.evidence.lineId) === bullet.claimId,
                          );
                          if (cited) jumpToLine(cited.evidence.lineId);
                        }}
                      >
                        Source · {bullet.claimId}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <p className="text-mist animate-rise-delay">
            {run.error || "No notes came out of this call."}
          </p>
        )}

        {run.attempts.length > 0 && (
          <section className="space-y-3 border-t border-white/10 pt-6 animate-rise-delay-2">
            <h3 className="text-sm uppercase tracking-[0.18em] text-mist">
              What the checker did
            </h3>
            <ul className="space-y-2 text-sm text-fog/80">
              {run.attempts.map((attempt) => (
                <li key={attempt.attempt}>
                  Try #{attempt.attempt} ·{" "}
                  {attempt.ok ? "accepted" : "sent back"} ·{" "}
                  {attemptReasonLine(attempt.reason)}
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
              {canPlayAudio
                ? "Click any source and this jumps to the sentence it came from, then plays that second."
                : "Click any source and this jumps to the sentence it came from."}
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
              const tainted = allClaims.some(
                (c) =>
                  c.evidence.lineId === line.id &&
                  claimStatus(c) === "blocked_injection",
              );
              return (
                <button
                  key={line.id}
                  id={`line-${line.id}`}
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
                    {tainted && (
                      <span className="badge-blocked">
                        instruction to the AI
                      </span>
                    )}
                    {line.startMs != null && canPlayAudio && (
                      <span>{(line.startMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  <p
                    className={`text-sm leading-relaxed ${
                      tainted
                        ? "text-mist line-through decoration-heat/60"
                        : "text-paper/90"
                    }`}
                  >
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
