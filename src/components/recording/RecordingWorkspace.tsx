"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DealSummaryCard } from "@/components/companies/DealSummaryCard";
import { DealSignalsView } from "@/components/DealSignalsView";
import { MethodologyScorecardView } from "@/components/MethodologyScorecardView";
import { RunActionsBar } from "@/components/RunActionsBar";
import { AudioPlayerBar } from "@/components/recording/AudioPlayerBar";
import { collectClaims } from "@/components/recording/claims";
import { DraftEmailPanel } from "@/components/recording/DraftEmailPanel";
import { InsightsRail } from "@/components/recording/InsightsRail";
import { TranscriptPanel } from "@/components/recording/TranscriptPanel";
import {
  buildAnalysisView,
  isSentinelEvidence,
  type SourceView,
} from "@/lib/analysis-view";
import type { DealSignalFeed } from "@/lib/deal-signals";
import { formatDateShort, formatDuration } from "@/lib/format";
import {
  attemptReasonLine,
  callTimeLabel,
  COVERAGE_BAND_LABEL,
  NO_NOTES_LINE,
  RUN_DETAILS_INTRO,
  RUN_DETAILS_SUMMARY,
  RUN_STATUS_LABEL,
} from "@/lib/labels";
import type { MethodologyScorecard } from "@/lib/methodology";
import { callSentiment, dealStateChipClass } from "@/lib/sentiment";
import type { RunRecord } from "@/lib/types";

export type RecordingTab = "transcript" | "email" | "scorecard" | "signals" | "deal";

export function RecordingWorkspace({
  run,
  company,
  companyKey,
  initialTab,
  initialCard,
  signalFeed,
  llmAvailable,
  packs,
  defaultPackId,
  detectedKind,
  shareMode = false,
}: {
  run: RunRecord;
  company: string;
  /** Normalized company key — Deal Insights fetches the cluster summary. */
  companyKey?: string;
  initialTab: RecordingTab;
  initialCard: MethodologyScorecard | null;
  signalFeed: DealSignalFeed | null;
  llmAvailable: boolean;
  packs: Array<{ id: string; name: string }>;
  defaultPackId?: string;
  detectedKind?: string;
  shareMode?: boolean;
}) {
  const [tab, setTab] = useState<RecordingTab>(initialTab);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const canPlayAudio = Boolean(run.audioContentType) && !shareMode;
  const notes = run.notes;
  const view = useMemo(() => buildAnalysisView(run), [run]);
  const sentiment = notes ? callSentiment(notes) : null;

  const lineById = useMemo(
    () => new Map(run.transcript.map((line) => [line.id, line])),
    [run.transcript],
  );

  // Routed-email bullets carry claim ids; resolve them to a reader-facing
  // source (timestamp + quote) or nothing at all when the evidence is a
  // sentinel — internal addressing never reaches the page.
  const sourceForClaim = useMemo(() => {
    const claims = collectClaims(notes);
    return (claimId: string): SourceView | null => {
      const claim = claims.find(
        (c) => (c.id || c.evidence.lineId) === claimId,
      );
      if (!claim || isSentinelEvidence(claim.evidence)) return null;
      const line = lineById.get(claim.evidence.lineId);
      if (!line) return null;
      return {
        lineId: line.id,
        quote: claim.evidence.quote,
        timeLabel: callTimeLabel(line.startMs),
        speaker: null,
      };
    };
  }, [notes, lineById]);

  const durationMs = useMemo(() => {
    for (let i = run.transcript.length - 1; i >= 0; i--) {
      const line = run.transcript[i];
      if (line.endMs != null) return line.endMs;
      if (line.startMs != null) return line.startMs;
    }
    return null;
  }, [run.transcript]);

  useEffect(() => {
    if (!activeLineId) return;
    const el = document.getElementById(`line-${activeLineId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineId]);

  function jumpToLine(lineId: string) {
    if (tab !== "transcript") setTab("transcript");
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

  function selectTab(next: RecordingTab) {
    setTab(next);
    if (shareMode) return;
    const href = next === "transcript" ? pathname : `${pathname}?tab=${next}`;
    router.replace(href, { scroll: false });
  }

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

  function tabClass(name: RecordingTab) {
    return `border-b-2 px-1 pb-2.5 text-sm font-medium transition ${
      tab === name
        ? "border-brand text-fg"
        : "border-transparent text-fg-muted hover:text-fg"
    }`;
  }

  const coverage = notes?.coverage;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10">
      {!shareMode && (
        <Link
          href="/recordings"
          className="text-sm font-medium text-fg-muted hover:text-fg"
        >
          ← Back to Recordings
        </Link>
      )}

      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            {view.title}
          </h1>
          <span className="text-fg-soft">·</span>
          <span className="text-[15px] font-medium text-fg-muted">{company}</span>
          <span className="text-fg-soft">|</span>
          <span className="text-[15px] text-fg-muted">
            {formatDateShort(run.createdAt)}
          </span>
          {durationMs != null && (
            <>
              <span className="text-fg-soft">|</span>
              <span className="text-[15px] text-fg-muted">
                {formatDuration(durationMs)} min
              </span>
            </>
          )}
          {sentiment && (
            <span className={`chip ${dealStateChipClass(sentiment.state)}`}>
              ● {sentiment.state}
            </span>
          )}
        </div>

        {view.fraction && (
          <p className="mt-2 text-sm text-fg-muted">
            <span className="font-medium text-positive">✓ {view.fraction}</span>
            {view.correctedCount > 0 && (
              <>
                {" · "}
                {view.correctedCount} citation
                {view.correctedCount === 1 ? "" : "s"} corrected
              </>
            )}
            {view.notFoundCount > 0 && (
              <>
                {" · "}
                <span className="text-danger">
                  ⚠ {view.notFoundCount} could not be verified
                </span>
              </>
            )}
            {view.blockedCount > 0 && (
              <>
                {" · "}
                <span className="text-danger">
                  ⛔ {view.blockedCount} blocked
                </span>
              </>
            )}
            . Nothing is deleted — every note stays on this page, marked.
          </p>
        )}
        {view.noNotes && (
          <p className="mt-2 text-sm text-fg-muted">{NO_NOTES_LINE}</p>
        )}

        {!shareMode && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-fg-muted">
            <span>{RUN_STATUS_LABEL[run.status]}</span>
            <span>·</span>
            <span>{run.sourceLabel}</span>
            <span>·</span>
            <a className="receipt-link" href={`/share/${run.shareToken}`}>
              Share link
            </a>
            <button type="button" className="receipt-link" onClick={copyShareLink}>
              {copied ? "Copied" : "Copy share URL"}
            </button>
            <a className="receipt-link" href={`/api/runs/${run.id}/export?format=md`}>
              Export MD
            </a>
            <a className="receipt-link" href={`/api/runs/${run.id}/export?format=json`}>
              Export JSON
            </a>
          </div>
        )}

        {view.blockedCount > 0 && (
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
            <p className="font-semibold text-danger">
              {view.blockedCount} note{view.blockedCount === 1 ? "" : "s"} blocked
            </p>
            <p className="mt-1 text-fg-muted">
              Someone spoke an instruction to the AI on this call. Anything
              standing on that moment is struck through and barred from the
              follow-up email. When a call talks to your AI, that is an attack
              on your notes, and an attack never counts as a source.
            </p>
          </div>
        )}

        {run.status !== "shipped" && (
          <div className="mt-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
            <p className="font-semibold text-warn">
              {RUN_STATUS_LABEL[run.status]}
              {coverage ? `: ${COVERAGE_BAND_LABEL[coverage.band]}` : ""}
            </p>
            <p className="mt-1 text-fg-muted">
              {run.error ||
                "Notes the AI could not point to are still on this page. They are marked, and they never appear as facts."}
            </p>
          </div>
        )}

        {!shareMode && (
          <div className="mt-4">
            <RunActionsBar runId={run.id} />
          </div>
        )}
      </header>

      {canPlayAudio && (
        <div className="mt-5">
          <audio
            ref={audioRef}
            className="hidden"
            preload="metadata"
            src={`/api/runs/${run.id}/audio`}
          />
          <AudioPlayerBar runId={run.id} audioRef={audioRef} />
        </div>
      )}

      <div
        className={`mt-6 grid gap-8 ${
          tab === "scorecard" || tab === "deal"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[1.1fr_0.9fr]"
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap gap-6 border-b border-edge">
            <button
              type="button"
              className={tabClass("transcript")}
              onClick={() => selectTab("transcript")}
            >
              Transcript
            </button>
            <button
              type="button"
              className={tabClass("email")}
              onClick={() => selectTab("email")}
            >
              Draft Email
            </button>
            {!shareMode && (
              <>
                <button
                  type="button"
                  className={tabClass("deal")}
                  onClick={() => selectTab("deal")}
                >
                  Deal Insights
                </button>
                <button
                  type="button"
                  className={tabClass("scorecard")}
                  onClick={() => selectTab("scorecard")}
                >
                  Scorecard
                  {initialCard
                    ? ` · ${initialCard.pack.name} ${initialCard.score}`
                    : ""}
                </button>
                <button
                  type="button"
                  className={tabClass("signals")}
                  onClick={() => selectTab("signals")}
                >
                  Signals
                  {signalFeed ? ` · ${signalFeed.alerts.length}` : ""}
                </button>
              </>
            )}
          </div>

          <div className="pt-4">
            {tab === "transcript" ? (
              <>
                <TranscriptPanel
                  lines={view.transcript}
                  activeLineId={activeLineId}
                  canPlayAudio={canPlayAudio}
                  onJump={jumpToLine}
                />
                {run.attempts.length > 0 && !shareMode && (
                  <details className="mt-6 border-t border-edge pt-4">
                    <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-soft">
                      {RUN_DETAILS_SUMMARY}
                    </summary>
                    <p className="mt-2 text-[12.5px] text-fg-soft">
                      {RUN_DETAILS_INTRO}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-[13px] text-fg-muted">
                      {run.attempts.map((attempt) => (
                        <li key={attempt.attempt}>
                          Try #{attempt.attempt} ·{" "}
                          {attempt.ok ? "accepted" : "sent back"} ·{" "}
                          {attemptReasonLine(attempt.reason)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : tab === "email" ? (
              <DraftEmailPanel
                email={view.email}
                routed={notes?.routedFollowUp}
                sourceForClaim={sourceForClaim}
                onSource={jumpToLine}
              />
            ) : tab === "scorecard" ? (
              <div className="overflow-hidden rounded-2xl border border-edge bg-surface">
                <MethodologyScorecardView
                  run={run}
                  initialCard={initialCard}
                  defaultPackId={defaultPackId}
                  detectedKind={detectedKind}
                  llmAvailable={llmAvailable}
                  packs={packs}
                  onSource={jumpToLine}
                />
              </div>
            ) : tab === "deal" ? (
              <div className="rounded-2xl border border-edge bg-surface px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
                  Deal insights · {company}
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  The story across every analyzed call with this company, built
                  only from gate-passed claims. Opens when you click this tab.
                </p>
                {companyKey ? (
                  <DealSummaryCard companyKey={companyKey} />
                ) : (
                  <p className="mt-4 text-sm text-fg-muted">
                    No company key on this run — analyze it with a company name
                    to unlock deal insights.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-edge bg-surface">
                <DealSignalsView feed={signalFeed} />
              </div>
            )}
          </div>
        </div>

        {tab !== "scorecard" && tab !== "deal" && (
          <aside className="min-w-0">
            <div className="lg:sticky lg:top-6">
              <p className="pb-3 text-[15px] font-semibold text-fg">
                ⊕ Call Insights
              </p>
              <div className="max-h-[80vh] overflow-y-auto pr-1">
                <InsightsRail notes={notes} view={view} onSource={jumpToLine} />
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
