"use client";

import type { Claim, RunNotes } from "@/lib/types";
import { isEmailableStatus } from "@/lib/types";
import {
  linesCutLine,
  modelSourceLabel,
  routedPanelTitle,
} from "@/lib/labels";

export function DraftEmailPanel({
  notes,
  allClaims,
  onSource,
}: {
  notes: RunNotes | null;
  allClaims: Claim[];
  onSource: (lineId: string) => void;
}) {
  if (!notes) {
    return (
      <p className="px-1 py-6 text-sm text-fg-muted">
        No notes shipped, so no draft was written.
      </p>
    );
  }

  const routed = notes.routedFollowUp;

  return (
    <div className="space-y-6">
      {routed && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-fg">
              {routedPanelTitle(routed.template.short)}
            </h3>
            <span className="chip chip-brand">
              Template · {routed.template.id}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-fg-muted">
            {routed.template.explainer}
          </p>
          <p className="mt-4 text-sm font-medium text-fg">
            Subject: {routed.subject}
          </p>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-edge bg-canvas p-4 font-sans text-sm leading-relaxed text-fg">
            {routed.body}
          </pre>
          <p className="mt-2 text-[12px] text-fg-soft">
            Written by {routed.provenance.model} (
            {modelSourceLabel(routed.provenance.source)}) ·{" "}
            {linesCutLine(routed.provenance.cut, routed.provenance.offTemplateCut)}
          </p>
          {routed.bullets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {routed.bullets.map((bullet, index) => (
                <button
                  key={`${bullet.claimId}-${index}`}
                  type="button"
                  className="receipt-link text-[12.5px]"
                  onClick={() => {
                    const cited = allClaims.find(
                      (c) => (c.id || c.evidence.lineId) === bullet.claimId,
                    );
                    if (cited) onSource(cited.evidence.lineId);
                  }}
                >
                  Source · {bullet.claimId}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-fg">
            {routed ? "Deterministic draft" : "Follow-up email"}
          </h3>
          <span className="chip chip-muted">Built only from backed notes</span>
        </div>
        {!isEmailableStatus(notes.followUpEmail.status) && (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            No draft went out. A note has to be backed by a line in the call
            before it can leave this page, and none here were.
          </p>
        )}
        <p className="mt-4 text-sm font-medium text-fg">
          Subject: {notes.followUpEmail.subject}
        </p>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-edge bg-canvas p-4 font-sans text-sm leading-relaxed text-fg">
          {notes.followUpEmail.body}
        </pre>
        <button
          type="button"
          className="receipt-link mt-2 text-[12.5px]"
          onClick={() => onSource(notes.followUpEmail.evidence.lineId)}
        >
          Source · {notes.followUpEmail.evidence.lineId}: &ldquo;
          {notes.followUpEmail.evidence.quote}&rdquo;
        </button>
      </section>
    </div>
  );
}
