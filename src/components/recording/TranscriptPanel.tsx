"use client";

import type { TranscriptLineView } from "@/lib/analysis-view";

export function TranscriptPanel({
  lines,
  activeLineId,
  canPlayAudio,
  onJump,
}: {
  lines: TranscriptLineView[];
  activeLineId: string | null;
  canPlayAudio: boolean;
  onJump: (lineId: string) => void;
}) {
  if (lines.length === 0) {
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
          ? "Click any line (or any source in the insights) to jump here and play that second."
          : "Click any source in the insights and this jumps to the sentence it came from."}
      </p>
      {lines.map((line) => {
        const active = activeLineId === line.lineId;
        return (
          <button
            key={line.lineId}
            id={`line-${line.lineId}`}
            type="button"
            onClick={() => onJump(line.lineId)}
            className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
              active ? "line-active" : "hover:bg-canvas"
            }`}
          >
            <div className="mb-0.5 flex items-center gap-2 text-xs text-fg-soft">
              {line.speaker && (
                <span className="font-semibold text-fg-muted">
                  {line.speaker}
                </span>
              )}
              {line.timeLabel && (
                <span className="tabular-nums">{line.timeLabel}</span>
              )}
              {line.blocked && (
                <span className="badge-blocked">instruction to the AI</span>
              )}
            </div>
            <p
              className={`text-sm leading-relaxed ${
                line.blocked
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
