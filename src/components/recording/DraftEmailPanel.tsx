"use client";

import type { AnalysisView, SourceView } from "@/lib/analysis-view";
import {
  EMAIL_HELD_BACK_LINE,
  linesCutLine,
  modelSourceLabel,
  routedPanelTitle,
  sourceLine,
} from "@/lib/labels";
import type { RoutedFollowUpEmail } from "@/lib/types";

export function DraftEmailPanel({
  email,
  routed,
  sourceForClaim,
  onSource,
}: {
  email: AnalysisView["email"];
  routed: RoutedFollowUpEmail | null | undefined;
  sourceForClaim: (claimId: string) => SourceView | null;
  onSource: (lineId: string) => void;
}) {
  return (
    <div className="space-y-6">
      {routed && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-fg">
              {routedPanelTitle(routed.template.short)}
            </h3>
            <span className="chip chip-brand">From the template library</span>
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
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {routed.bullets.map((bullet, index) => {
                const source = sourceForClaim(bullet.claimId);
                if (!source) return null;
                return (
                  <button
                    key={`${bullet.claimId}-${index}`}
                    type="button"
                    className="receipt-link text-[12.5px]"
                    onClick={() => onSource(source.lineId)}
                  >
                    {sourceLine(source.timeLabel)}
                  </button>
                );
              })}
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
        {email.held ? (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {EMAIL_HELD_BACK_LINE}
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-fg">
              Subject: {email.subject}
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-edge bg-canvas p-4 font-sans text-sm leading-relaxed text-fg">
              {email.body}
            </pre>
            {email.source && (
              <button
                type="button"
                className="receipt-link mt-2 text-[12.5px]"
                onClick={() => onSource(email.source!.lineId)}
              >
                {sourceLine(email.source.timeLabel)} · &ldquo;
                {email.source.quote.slice(0, 70)}
                {email.source.quote.length > 70 ? "…" : ""}&rdquo;
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
