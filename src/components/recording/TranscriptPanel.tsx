"use client";

import type { Claim, TranscriptLine } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { claimStatus } from "@/components/recording/claims";

export function TranscriptPanel({
  transcript,
  allClaims,
  activeLineId,
  canPlayAudio,
  onJump,
}: {
  transcript: TranscriptLine[];
  allClaims: Claim[];
  activeLineId: string | null;
  canPlayAudio: boolean;
  onJump: (lineId: string) => void;
}) {
  if (transcript.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-fg-muted">
        No transcript came out of this call.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="px-1 pb-2 text-[13px] text-fg-muted">
        {canPlayAudio
          ? "Click any line (or any Source in the insights) to jump here and play that second."
          : "Click any Source in the insights and this jumps to the sentence it came from."}
      </p>
      {transcript.map((line) => {
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
            onClick={() => onJump(line.id)}
            className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
              active ? "line-active" : "hover:bg-canvas"
            }`}
          >
            <div className="mb-0.5 flex items-center gap-2 text-xs text-fg-soft">
              <span className="font-semibold text-fg-muted">{line.speaker}</span>
              <span>{line.id}</span>
              {line.startMs != null && (
                <span className="tabular-nums">
                  {formatDuration(line.startMs) ?? "0:00"}
                </span>
              )}
              {tainted && (
                <span className="badge-blocked">instruction to the AI</span>
              )}
            </div>
            <p
              className={`text-sm leading-relaxed ${
                tainted
                  ? "text-fg-soft line-through decoration-danger/60"
                  : "text-fg"
              }`}
            >
              {line.text}
            </p>
          </button>
        );
      })}
    </div>
  );
}
