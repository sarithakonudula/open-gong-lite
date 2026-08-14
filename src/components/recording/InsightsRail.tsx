"use client";

import type {
  AnalysisView,
  NoteSectionView,
  NoteView,
  SourceView,
} from "@/lib/analysis-view";
import {
  blockedReasonLine,
  COULD_NOT_VERIFY_EXPLAINER,
  sourceLine,
  TOPICS_HEADING,
} from "@/lib/labels";
import { callSentiment, SENTIMENT_BASIS_CAPTION } from "@/lib/sentiment";
import type { RunNotes } from "@/lib/types";

function RailCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
        {label}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SourceButton({
  source,
  onSource,
}: {
  source: SourceView;
  onSource: (lineId: string) => void;
}) {
  return (
    <button
      type="button"
      className="receipt-link truncate text-left text-[12px]"
      onClick={() => onSource(source.lineId)}
    >
      {sourceLine(source.timeLabel)} · &ldquo;
      {source.quote.slice(0, 70)}
      {source.quote.length > 70 ? "…" : ""}&rdquo;
    </button>
  );
}

function NoteRow({
  note,
  onSource,
}: {
  note: NoteView;
  onSource: (lineId: string) => void;
}) {
  const struck =
    note.status === "uncorroborated" || note.status === "blocked_injection";
  return (
    <li className="flex gap-2.5">
      {note.source?.timeLabel ? (
        <button
          type="button"
          onClick={() => onSource(note.source!.lineId)}
          className="mt-0.5 h-fit shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-brand hover:brightness-95"
          title="Jump to this moment"
        >
          {note.source.timeLabel}
        </button>
      ) : (
        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-edge-strong" />
      )}
      <div className="min-w-0">
        <p
          className={`text-[13.5px] leading-snug ${
            struck ? "text-fg-soft line-through decoration-danger/60" : "text-fg"
          }`}
        >
          {note.text}
        </p>
        {note.source && (
          <div className="mt-1">
            <SourceButton source={note.source} onSource={onSource} />
          </div>
        )}
        {note.status === "blocked_injection" && (
          <p className="mt-1 text-[12px] text-danger">
            {blockedReasonLine(note.blockedReasons)}
          </p>
        )}
        {note.status === "uncorroborated" && (
          <p className="mt-1 text-[12px] text-danger">
            {COULD_NOT_VERIFY_EXPLAINER}
          </p>
        )}
      </div>
    </li>
  );
}

function SectionCard({
  section,
  onSource,
}: {
  section: NoteSectionView;
  onSource: (lineId: string) => void;
}) {
  const all = [...section.backed, ...section.unverified, ...section.blocked];
  return (
    <RailCard label={section.title}>
      {all.length > 0 ? (
        <ul className="space-y-3">
          {all.map((note) => (
            <NoteRow key={note.key} note={note} onSource={onSource} />
          ))}
        </ul>
      ) : null}
      {section.absenceLine && (
        <p
          className={`text-[13px] italic text-fg-soft ${all.length > 0 ? "mt-2" : ""}`}
        >
          {section.absenceLine}
        </p>
      )}
    </RailCard>
  );
}

export function InsightsRail({
  view,
  notes,
  onSource,
}: {
  view: AnalysisView;
  notes: RunNotes | null;
  onSource: (lineId: string) => void;
}) {
  const sentiment = notes ? callSentiment(notes) : null;
  const summary = view.sections.find((s) => s.id === "summary");
  const rest = view.sections.filter(
    (s) => s.id !== "summary" && s.id !== "nextSteps",
  );
  const nextSteps = view.sections.find((s) => s.id === "nextSteps");

  return (
    <div className="space-y-4">
      {sentiment && (
        <RailCard label="Overall sentiment">
          <div className="flex items-center gap-4">
            <p
              className={`text-4xl font-bold tabular-nums ${
                sentiment.state === "Positive"
                  ? "text-positive"
                  : sentiment.state === "Neutral"
                    ? "text-info"
                    : "text-danger"
              }`}
            >
              {sentiment.pct}%
            </p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas">
              <div
                className={`h-full rounded-full ${
                  sentiment.state === "Positive"
                    ? "bg-positive"
                    : sentiment.state === "Neutral"
                      ? "bg-info"
                      : "bg-danger"
                }`}
                style={{ width: `${sentiment.pct}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-fg-soft">
            {SENTIMENT_BASIS_CAPTION}
          </p>
        </RailCard>
      )}

      {summary && <SectionCard section={summary} onSource={onSource} />}

      {view.topics.length > 0 && (
        <RailCard label={TOPICS_HEADING}>
          <div className="flex flex-wrap gap-1.5">
            {view.topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                className="chip chip-brand cursor-pointer hover:brightness-95"
                onClick={() => onSource(topic.lineId)}
                title={
                  topic.timeLabel
                    ? `Hear it at ${topic.timeLabel}`
                    : "Jump to the line"
                }
              >
                {topic.label}
                {topic.timeLabel ? ` · ${topic.timeLabel}` : ""}
              </button>
            ))}
          </div>
        </RailCard>
      )}

      {view.ownerGroups.length > 0 && (
        <RailCard label="Action items">
          <div className="space-y-4">
            {view.ownerGroups.map((group) => (
              <div key={group.owner}>
                <p className="text-[12px] font-semibold text-fg-muted">
                  {group.ownerLabel}
                </p>
                <ul className="mt-1.5 space-y-2.5">
                  {group.steps.map((step) => (
                    <li key={step.key} className="flex gap-2.5">
                      {step.source?.timeLabel ? (
                        <button
                          type="button"
                          onClick={() => onSource(step.source!.lineId)}
                          className="mt-0.5 h-fit shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-brand hover:brightness-95"
                        >
                          {step.source.timeLabel}
                        </button>
                      ) : (
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-edge-strong" />
                      )}
                      <div>
                        <p className="text-[13.5px] leading-snug text-fg">
                          {step.text}
                        </p>
                        {step.due && (
                          <p className="text-[12px] text-fg-muted">
                            Due: {step.due}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </RailCard>
      )}

      {nextSteps && view.ownerGroups.length === 0 && (
        <SectionCard section={nextSteps} onSource={onSource} />
      )}

      {rest
        .filter((s) => s.hasContent || s.id === "objections" || s.id === "intent")
        .map((section) => (
          <SectionCard key={section.id} section={section} onSource={onSource} />
        ))}
    </div>
  );
}
