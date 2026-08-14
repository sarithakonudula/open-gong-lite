"use client";

import { useEffect, useState } from "react";

/** Action layer for one run: CRM write-back + contextual follow-up draft. */
type DealCandidate = {
  id: string;
  name: string;
  stage: string | null;
  amount: number | null;
};

type StageSuggestion = {
  fromStageId: string;
  fromLabel: string;
  toStageId: string;
  toLabel: string;
  reason: string;
};

export function RunActionsBar({ runId }: { runId: string }) {
  const [hubspotReady, setHubspotReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DealCandidate[] | null>(null);
  const [stageSuggestion, setStageSuggestion] = useState<
    (StageSuggestion & { dealId: string }) | null
  >(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/hubspot/status")
      .then((r) => r.json())
      .then((d) => setHubspotReady(Boolean(d.connected)))
      .catch(() => null);
  }, []);

  async function syncToHubspot(dealId?: string) {
    setSyncStatus("Syncing…");
    setCandidates(null);
    try {
      const response = await fetch("/api/hubspot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dealId ? { runId, dealId } : { runId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");
      if (data.needsSelection) {
        setCandidates(data.candidates ?? []);
        setSyncStatus(
          data.candidates?.length
            ? `${data.candidates.length} deals match "${data.company}" — pick the right one:`
            : `No HubSpot deal found for "${data.company}".`,
        );
        return;
      }
      const r = data.result;
      setSyncStatus(
        r.momentumScore != null
          ? `✅ ${r.dealName}: momentum ${r.momentumScore}/100 (${r.momentumDirection}) + note written · linked for next time`
          : `✅ ${r.dealName}: cited notes written (non-sales call — momentum skipped) · linked for next time`,
      );
      setStageSuggestion(
        data.stageSuggestion ? { ...data.stageSuggestion, dealId: r.dealId } : null,
      );
    } catch (error) {
      setSyncStatus(
        `❌ ${error instanceof Error ? error.message : "Sync failed"}`,
      );
    }
  }

  async function approveStageMove() {
    if (!stageSuggestion) return;
    setSyncStatus("Moving stage…");
    try {
      const response = await fetch("/api/hubspot/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          dealId: stageSuggestion.dealId,
          stageId: stageSuggestion.toStageId,
          reason: stageSuggestion.reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Stage move failed");
      setSyncStatus(
        `✅ Stage moved: ${stageSuggestion.fromLabel} → ${stageSuggestion.toLabel} (note written)`,
      );
      setStageSuggestion(null);
    } catch (error) {
      setSyncStatus(
        `❌ ${error instanceof Error ? error.message : "Stage move failed"}`,
      );
    }
  }

  async function draftContextualEmail() {
    setEmailStatus("Drafting…");
    setDraft(null);
    try {
      const response = await fetch("/api/email/contextual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft failed");
      setDraft({ subject: data.subject, body: data.body });
      setEmailStatus(
        data.source === "llm_crm"
          ? "LLM draft from verified claims + CRM context"
          : `Deterministic draft (${data.fallbackReason ?? "no LLM"}) — every bullet gate-passed`,
      );
    } catch (error) {
      setEmailStatus(
        `❌ ${error instanceof Error ? error.message : "Draft failed"}`,
      );
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-mist/25 bg-paper/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-mist">
          Actions
        </span>
        <button className="btn-ghost" onClick={draftContextualEmail}>
          Draft contextual email
        </button>
        <button
          className="btn-ghost"
          onClick={() => syncToHubspot()}
          disabled={!hubspotReady}
          title={
            hubspotReady
              ? "Write momentum + notes to the matching HubSpot deal"
              : "Connect HubSpot on /admin first"
          }
        >
          {hubspotReady ? "Sync to HubSpot" : "HubSpot not connected"}
        </button>
        <a href="/digest" className="btn-ghost">
          Digest
        </a>
        <a href="/coach" className="btn-ghost">
          Coach
        </a>
      </div>
      {syncStatus && <p className="mt-2 text-sm text-fog">{syncStatus}</p>}
      {stageSuggestion && (
        <div className="mt-2 rounded-lg border border-signal/40 bg-signal/5 px-3 py-2.5">
          <p className="text-sm text-fog">
            Suggested stage move:{" "}
            <span className="font-medium text-foreground">
              {stageSuggestion.fromLabel} → {stageSuggestion.toLabel}
            </span>
          </p>
          <p className="mt-1 text-xs text-mist">{stageSuggestion.reason}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary !px-3 !py-1.5 text-sm" onClick={approveStageMove}>
              Approve move
            </button>
            <button
              className="btn-ghost !px-3 !py-1.5 text-sm"
              onClick={() => setStageSuggestion(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {candidates && candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              key={c.id}
              className="btn-ghost"
              onClick={() => syncToHubspot(c.id)}
            >
              {c.name}
              {c.amount ? ` · $${c.amount}` : ""}
              {c.stage ? ` · ${c.stage}` : ""}
            </button>
          ))}
        </div>
      )}
      {emailStatus && <p className="mt-2 text-sm text-fog">{emailStatus}</p>}
      {draft && (
        <div className="mt-3 rounded-lg border border-mist/20 bg-paper/60 p-3">
          <p className="text-sm font-medium">{draft.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-fog/90">
            {draft.body}
          </p>
        </div>
      )}
    </div>
  );
}
