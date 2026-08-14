"use client";

import { useMemo } from "react";
import type { Claim, RunNotes, TranscriptLine } from "@/lib/types";
import { callSentiment, SENTIMENT_BASIS_CAPTION } from "@/lib/sentiment";
import { deriveTopics } from "@/lib/topics";
import { formatDuration } from "@/lib/format";
import { blockedReasonLine, NOTE_STATUS_LABEL } from "@/lib/labels";
import { BADGE_CLASS, claimStatus } from "@/components/recording/claims";

const TAG_CLASS: Record<string, string> = {
  pricing: "chip-neutral",
  competitor: "chip-warn",
  "high intent": "chip-positive",
  "next steps": "chip-brand",
  budget: "chip-neutral",
  timeline: "chip-warn",
  demo: "chip-brand",
  "follow up": "chip-muted",
  objection: "chip-warn",
};

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

function ClaimList({
  claims,
  lineStart,
  onSource,
  compact = false,
}: {
  claims: Claim[];
  lineStart: Map<string, number>;
  onSource: (lineId: string) => void;
  compact?: boolean;
}) {
  if (!claims.length) {
    return <p className="text-[13px] text-fg-soft">Nothing on this in the call.</p>;
  }
  return (
    <ul className="space-y-3">
      {claims.map((claim, index) => {
        const status = claimStatus(claim);
        const startMs = lineStart.get(claim.evidence.lineId);
        const struck =
          status === "uncorroborated" || status === "blocked_injection";
        return (
          <li key={claim.id || `${index}`} className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onSource(claim.evidence.lineId)}
              className="mt-0.5 h-fit shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-brand hover:brightness-95"
              title={`Jump to ${claim.evidence.lineId}`}
            >
              {startMs != null
                ? (formatDuration(startMs) ?? claim.evidence.lineId)
                : claim.evidence.lineId}
            </button>
            <div className="min-w-0">
              <p
                className={`text-[13.5px] leading-snug ${
                  struck
                    ? "text-fg-soft line-through decoration-danger/60"
                    : "text-fg"
                }`}
              >
                {claim.text}
              </p>
              {!compact && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={BADGE_CLASS[status]}>
                    {NOTE_STATUS_LABEL[status]}
                  </span>
                  <button
                    type="button"
                    className="receipt-link truncate text-left text-[12px]"
                    onClick={() => onSource(claim.evidence.lineId)}
                  >
                    {status === "uncorroborated"
                      ? "Quote the AI offered"
                      : "Source"}{" "}
                    · {claim.evidence.lineId}: &ldquo;
                    {claim.evidence.quote.slice(0, 60)}
                    {claim.evidence.quote.length > 60 ? "…" : ""}&rdquo;
                  </button>
                </div>
              )}
              {status === "blocked_injection" && (
                <p className="mt-1 text-[12px] text-danger">
                  {blockedReasonLine(claim.blockedReasons)}
                </p>
              )}
              {status === "uncorroborated" && (
                <p className="mt-1 text-[12px] text-danger">
                  That sentence is nowhere in the call — the note stays here
                  unbacked and never enters the follow-up email.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function InsightsRail({
  notes,
  transcript,
  onSource,
}: {
  notes: RunNotes | null;
  transcript: TranscriptLine[];
  onSource: (lineId: string) => void;
}) {
  const lineStart = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of transcript) {
      if (line.startMs != null) map.set(line.id, line.startMs);
    }
    return map;
  }, [transcript]);

  if (!notes) {
    return (
      <RailCard label="Call insights">
        <p className="text-[13px] text-fg-muted">
          No verified notes came out of this call.
        </p>
      </RailCard>
    );
  }

  const sentiment = callSentiment(notes);
  const topics = deriveTopics(notes);

  return (
    <div className="space-y-4">
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

      <RailCard label="Summary">
        <ClaimList
          claims={notes.summary}
          lineStart={lineStart}
          onSource={onSource}
        />
      </RailCard>

      {topics.length > 0 && (
        <RailCard label="Topics mentioned">
          <div className="flex flex-wrap gap-1.5">
            {topics.map((tag) => (
              <span key={tag} className={`chip ${TAG_CLASS[tag] ?? "chip-muted"}`}>
                {tag}
              </span>
            ))}
          </div>
        </RailCard>
      )}

      <RailCard label="Objections">
        <ClaimList
          claims={notes.objections}
          lineStart={lineStart}
          onSource={onSource}
        />
      </RailCard>

      <RailCard label="Intent">
        <ClaimList
          claims={notes.intent}
          lineStart={lineStart}
          onSource={onSource}
        />
      </RailCard>

      <RailCard label="Next steps">
        <ClaimList
          claims={notes.nextSteps}
          lineStart={lineStart}
          onSource={onSource}
        />
      </RailCard>

      {(notes.pain || []).length > 0 && (
        <RailCard label="Pain">
          <ClaimList
            claims={notes.pain || []}
            lineStart={lineStart}
            onSource={onSource}
          />
        </RailCard>
      )}

      {(notes.pricing || []).length > 0 && (
        <RailCard label="Pricing">
          <ClaimList
            claims={notes.pricing || []}
            lineStart={lineStart}
            onSource={onSource}
          />
        </RailCard>
      )}

      {(notes.competitors || []).length > 0 && (
        <RailCard label="Competitors">
          <ClaimList
            claims={notes.competitors || []}
            lineStart={lineStart}
            onSource={onSource}
          />
        </RailCard>
      )}
    </div>
  );
}
