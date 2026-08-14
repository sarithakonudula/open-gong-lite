"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisView,
  NoteSectionView,
  NoteView,
  SourceView,
} from "@/lib/analysis-view";
import { buildAnalysisView } from "@/lib/analysis-view";
import type { ClaimStatus, RunRecord } from "@/lib/types";
import {
  attemptReasonLine,
  blockedHeading,
  blockedReasonLine,
  COULD_NOT_VERIFY_EXPLAINER,
  couldNotVerifyHeading,
  COVERAGE_BAND_LABEL,
  EMAIL_HELD_BACK_LINE,
  linesCutLine,
  modelSourceLabel,
  NO_NOTES_LINE,
  NOTE_STATUS_LABEL,
  routedPanelTitle,
  RUN_DETAILS_INTRO,
  RUN_DETAILS_SUMMARY,
  RUN_STATUS_LABEL,
  sourceLine,
  templateLinesHeldBackLine,
  TOPICS_HEADING,
} from "@/lib/labels";

/**
 * The notes screen.
 *
 * Everything it shows comes from `buildAnalysisView`, which is where the rules
 * about what may reach a reader live and where they are tested. This file
 * decides how those things look and nothing else: no status enum, no line id,
 * no try count, and no sentinel reaches the DOM through here, because none of
 * them reach this file.
 */

/** Backed is the default state. Only exceptions announce themselves. */
const ANNOUNCED_STATUS: Partial<Record<ClaimStatus, string>> = {
  segment_corrected: "badge-corrected",
  uncorroborated: "badge-unproven",
  blocked_injection: "badge-blocked",
};

function SourceRow({
  source,
  onSource,
}: {
  source: SourceView;
  onSource: (lineId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <button
        type="button"
        className="receipt-link min-h-11 py-2 text-sm"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          onSource(source.lineId);
        }}
      >
        {sourceLine(source.timeLabel)}
      </button>
      {open && (
        <p className="mt-1 border-l-2 border-brand/30 pl-3 text-fg-muted">
          {source.speaker ? `${source.speaker}: ` : ""}“{source.quote}”
        </p>
      )}
    </div>
  );
}

function NoteItem({
  note,
  onSource,
  muted = false,
}: {
  note: NoteView;
  onSource: (lineId: string) => void;
  muted?: boolean;
}) {
  const badge = ANNOUNCED_STATUS[note.status];
  const blocked = note.status === "blocked_injection";
  return (
    <li className={`space-y-1.5 ${muted ? "border-l-2 border-edge pl-3" : ""}`}>
      <p
        className={`text-[1.06rem] leading-relaxed ${
          blocked
            ? "text-fg-soft line-through decoration-heat/60"
            : muted
              ? "text-fg-muted"
              : "text-fg"
        }`}
      >
        {note.text}
      </p>
      {badge && note.status !== "uncorroborated" && (
        <span className={badge}>{NOTE_STATUS_LABEL[note.status]}</span>
      )}
      {blocked && (
        <p className="text-sm text-danger">
          {blockedReasonLine(note.blockedReasons)}
        </p>
      )}
      {note.source && <SourceRow source={note.source} onSource={onSource} />}
    </li>
  );
}

function Section({
  section,
  onSource,
}: {
  section: NoteSectionView;
  onSource: (lineId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.18em] text-fg-soft">
        {section.title}
      </h3>
      {section.backed.length > 0 && (
        <ul className="space-y-4">
          {section.backed.map((note) => (
            <NoteItem key={note.key} note={note} onSource={onSource} />
          ))}
        </ul>
      )}
      {section.unverified.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs uppercase tracking-[0.16em] text-fg-soft">
            {couldNotVerifyHeading(section.unverified.length)}
          </p>
          <p className="text-sm text-fg-soft">{COULD_NOT_VERIFY_EXPLAINER}</p>
          <ul className="space-y-3">
            {section.unverified.map((note) => (
              <NoteItem key={note.key} note={note} onSource={onSource} muted />
            ))}
          </ul>
        </div>
      )}
      {section.blocked.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs uppercase tracking-[0.16em] text-danger">
            {blockedHeading(section.blocked.length)}
          </p>
          <ul className="space-y-3">
            {section.blocked.map((note) => (
              <NoteItem key={note.key} note={note} onSource={onSource} />
            ))}
          </ul>
        </div>
      )}
      {section.absenceLine && (
        <p className="text-sm text-fg-soft">{section.absenceLine}</p>
      )}
    </section>
  );
}

function OwnerActions({
  view,
  onSource,
}: {
  view: AnalysisView;
  onSource: (lineId: string) => void;
}) {
  if (!view.ownerGroups.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.18em] text-fg-soft">
        Action items
      </h3>
      <div className="space-y-4">
        {view.ownerGroups.map((group) => (
          <div key={group.owner} className="space-y-2">
            <p className="text-sm font-medium text-fg">{group.ownerLabel}</p>
            <ul className="space-y-2">
              {group.steps.map((step) => (
                <li key={step.key} className="text-[0.98rem] text-fg-muted">
                  {step.text}
                  {step.due ? (
                    <span className="text-fg-soft"> · due {step.due}</span>
                  ) : null}
                  {step.source?.timeLabel ? (
                    <button
                      type="button"
                      className="receipt-link ml-2 text-sm"
                      onClick={() => onSource(step.source!.lineId)}
                    >
                      {step.source.timeLabel}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
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

  const view = useMemo(() => buildAnalysisView(run), [run]);

  useEffect(() => {
    if (!activeLineId) return;
    const el = document.getElementById(`line-${activeLineId}`);
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

  const notes = run.notes;
  const sections = view.sections.filter(
    (section) => section.hasContent || section.absenceLine,
  );

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
      <div className="space-y-8">
        <header className="space-y-4 animate-rise">
          <p className="text-xs uppercase tracking-[0.22em] text-brand">
            Notes from this call
          </p>
          <h1 className="text-3xl leading-tight tracking-tight md:text-4xl">
            {view.title}
          </h1>

          {view.topics.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-fg-soft">
                {TOPICS_HEADING}
              </p>
              <div className="flex flex-wrap gap-2">
                {view.topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    className="topic-chip"
                    onClick={() => jumpToLine(topic.lineId)}
                  >
                    {topic.label}
                    {topic.timeLabel ? (
                      <span className="text-fg-soft"> {topic.timeLabel}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="max-w-2xl text-base text-fg-muted">
            Every note below carries a citation to the moment it came from.
            Open a source
            {canPlayAudio
              ? " to see that sentence in the call and hear that second."
              : " to see that sentence in the call."}{" "}
            A note the AI cannot point to stays on this page, marked, and never
            reaches the follow-up email.
          </p>

          {view.fraction && (
            <p className="text-sm text-fg-muted">
              <span className="text-brand">{view.fraction}</span>
              {view.correctedCount > 0 && (
                <>
                  {" · "}
                  {view.correctedCount} of those had the citation corrected
                </>
              )}
              {view.notFoundCount > 0 && (
                <>
                  {" · "}
                  <span className="text-danger">
                    {view.notFoundCount} not found in the call
                  </span>
                </>
              )}
              {view.blockedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-danger">
                    {view.blockedCount} blocked
                  </span>
                </>
              )}
              . Nothing is deleted. Every note stays on this page.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm text-fg-soft">
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

          {view.blockedCount > 0 && (
            <div className="rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm">
              <p className="font-medium text-danger">
                {view.blockedCount} note{view.blockedCount === 1 ? "" : "s"}{" "}
                blocked
              </p>
              <p className="mt-1 text-fg-muted">
                Someone spoke an instruction to the AI on this call. Anything
                standing on that moment is struck through below and barred from
                the follow-up email. When a call talks to your AI, that is an
                attack on your notes, and an attack never counts as a source.
              </p>
            </div>
          )}
        </header>

        {notes ? (
          <div className="space-y-10 animate-rise-delay">
            {view.noNotes ? (
              <p className="text-fg-muted">{NO_NOTES_LINE}</p>
            ) : (
              sections.map((section) => (
                <Section
                  key={section.id}
                  section={section}
                  onSource={jumpToLine}
                />
              ))
            )}

            <OwnerActions view={view} onSource={jumpToLine} />

            <section className="space-y-3">
              <h3 className="text-xs uppercase tracking-[0.18em] text-fg-soft">
                Follow-up email
              </h3>
              {view.email.held ? (
                <p className="text-sm text-danger">{EMAIL_HELD_BACK_LINE}</p>
              ) : (
                <>
                  <p className="text-sm text-fg-soft">
                    Subject: {view.email.subject}
                  </p>
                  <pre className="whitespace-pre-wrap rounded-2xl border border-edge bg-surface p-4 text-sm leading-relaxed text-fg">
                    {view.email.body}
                  </pre>
                  {view.email.source && (
                    <SourceRow
                      source={view.email.source}
                      onSource={jumpToLine}
                    />
                  )}
                </>
              )}
            </section>

            {notes.routedFollowUp && !view.email.held && (
              <section className="space-y-3">
                <h3 className="text-xs uppercase tracking-[0.18em] text-fg-soft">
                  {routedPanelTitle(notes.routedFollowUp.template.short)}
                </h3>
                <p className="text-sm text-fg-muted">
                  {notes.routedFollowUp.template.explainer}
                </p>
                <p className="text-sm text-fg-soft">
                  Subject: {notes.routedFollowUp.subject}
                </p>
                <pre className="whitespace-pre-wrap rounded-2xl border border-edge bg-surface p-4 text-sm leading-relaxed text-fg">
                  {notes.routedFollowUp.body}
                </pre>
              </section>
            )}
          </div>
        ) : (
          <p className="text-fg-soft animate-rise-delay">
            Nothing came back from this call that could be checked against the
            transcript.
          </p>
        )}

        <details className="rounded-2xl border border-edge bg-canvas px-4 py-3 animate-rise-delay-2">
          <summary className="cursor-pointer text-sm text-fg-soft">
            {RUN_DETAILS_SUMMARY}
          </summary>
          <div className="mt-3 space-y-2 text-sm text-fg-muted">
            <p>{RUN_DETAILS_INTRO}</p>
            <p>
              {RUN_STATUS_LABEL[run.status]}
              {notes?.coverage
                ? `: ${COVERAGE_BAND_LABEL[notes.coverage.band]}`
                : ""}
            </p>
            {view.suppressedTemplateCount > 0 && (
              <p>{templateLinesHeldBackLine(view.suppressedTemplateCount)}</p>
            )}
            {notes?.routedFollowUp && (
              <p>
                Routed draft written by {notes.routedFollowUp.provenance.model},
                which is{" "}
                {modelSourceLabel(notes.routedFollowUp.provenance.source)} ·{" "}
                {linesCutLine(
                  notes.routedFollowUp.provenance.cut,
                  notes.routedFollowUp.provenance.offTemplateCut,
                )}
              </p>
            )}
            {run.attempts.length > 0 && (
              <ul className="space-y-1">
                {run.attempts.map((attempt) => (
                  <li key={attempt.attempt}>
                    Pass {attempt.attempt} ·{" "}
                    {attempt.ok ? "accepted" : "sent back"} ·{" "}
                    {attemptReasonLine(attempt.reason)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>

      <aside className="animate-rise-delay-2">
        <div className="sticky top-6 overflow-hidden rounded-[1.5rem] border border-edge bg-surface">
          <div className="border-b border-edge px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-fg-soft">
              Transcript
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {canPlayAudio
                ? "Open any source and this jumps to the sentence it came from, then plays that second."
                : "Open any source and this jumps to the sentence it came from."}
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
            {view.transcript.map((line) => {
              const active = activeLineId === line.lineId;
              return (
                <button
                  key={line.lineId}
                  id={`line-${line.lineId}`}
                  type="button"
                  onClick={() => jumpToLine(line.lineId)}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${
                    active ? "line-active" : "hover:bg-white/5"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-fg-soft">
                    {line.timeLabel && <span>{line.timeLabel}</span>}
                    {line.speaker && (
                      <>
                        {line.timeLabel && <span>·</span>}
                        <span>{line.speaker}</span>
                      </>
                    )}
                    {line.blocked && (
                      <span className="badge-blocked">
                        instruction to the AI
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm leading-relaxed ${
                      line.blocked
                        ? "text-fg-soft line-through decoration-heat/60"
                        : "text-fg"
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
