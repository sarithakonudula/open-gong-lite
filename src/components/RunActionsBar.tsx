"use client";

import { useEffect, useState } from "react";

/** Action layer for one run: CRM write-back + contextual follow-up draft. */
type DealCandidate = {
  id: string;
  name: string;
  stage: string | null;
  amount: number | null;
};

export function RunActionsBar({ runId }: { runId: string }) {
  const [hubspotReady, setHubspotReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DealCandidate[] | null>(null);
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
    } catch (error) {
      setSyncStatus(
        `❌ ${error instanceof Error ? error.message : "Sync failed"}`,
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
