"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { linesCutLine, modelSourceLabel } from "@/lib/labels";

/** Action layer for one run: CRM write-back + follow-up drafts. */
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

type TemplateOption = {
  id: string;
  title: string;
  short: string;
  explainer: string;
  priority: number;
};

const AUTO_MATCH = "";

export function RunActionsBar({ runId }: { runId: string }) {
  const router = useRouter();
  const [hubspotReady, setHubspotReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DealCandidate[] | null>(null);
  const [stageSuggestion, setStageSuggestion] = useState<
    (StageSuggestion & { dealId: string }) | null
  >(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    subject: string;
    body: string;
    templateTitle?: string;
  } | null>(null);
  const [catalog, setCatalog] = useState<{
    runId: string;
    templates: TemplateOption[];
    matchingIds: string[];
    suggestedId: string | null;
  } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(AUTO_MATCH);

  const templatesBusy = catalog?.runId !== runId;
  const templates = catalog?.runId === runId ? catalog.templates : [];
  const matchingIds = new Set(
    catalog?.runId === runId ? catalog.matchingIds : [],
  );
  const suggestedId =
    catalog?.runId === runId ? catalog.suggestedId : null;

  useEffect(() => {
    fetch("/api/hubspot/status")
      .then((r) => r.json())
      .then((d) => setHubspotReady(Boolean(d.connected)))
      .catch(() => null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}/routed-email`)
      .then((r) => r.json())
      .then(
        (data: {
          templates?: TemplateOption[];
          suggestedId?: string | null;
          matchingIds?: string[];
        }) => {
          if (cancelled) return;
          const list = data.templates ?? [];
          setCatalog({
            runId,
            templates: list,
            suggestedId: data.suggestedId ?? null,
            matchingIds: data.matchingIds ?? [],
          });
          setSelectedTemplateId((prev) => {
            if (prev === AUTO_MATCH) return AUTO_MATCH;
            return list.some((t) => t.id === prev) ? prev : AUTO_MATCH;
          });
        },
      )
      .catch(() => {
        if (cancelled) return;
        setCatalog({
          runId,
          templates: [],
          suggestedId: null,
          matchingIds: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

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

  async function draftFromTemplate() {
    const chosen =
      selectedTemplateId === AUTO_MATCH ? null : selectedTemplateId;
    setEmailStatus(
      chosen ? "Drafting from the selected template…" : "Matching a template…",
    );
    setDraft(null);
    try {
      const response = await fetch(`/api/runs/${runId}/routed-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chosen ? { templateId: chosen } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft failed");
      setDraft({
        subject: data.subject,
        body: data.body,
        templateTitle: data.template?.title,
      });
      setEmailStatus(
        `${data.template.title} template · written by ${modelSourceLabel(
          data.provenance.source,
        )} · ${linesCutLine(
          data.provenance.cut,
          data.provenance.offTemplateCut,
        )}`,
      );
      // Refresh so the Draft Email tab shows the stored routed variant.
      router.refresh();
    } catch (error) {
      setEmailStatus(
        `❌ ${error instanceof Error ? error.message : "Draft failed"}`,
      );
    }
  }

  const selectedMeta =
    selectedTemplateId === AUTO_MATCH
      ? null
      : templates.find((t) => t.id === selectedTemplateId) ?? null;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-soft">
          Actions
        </span>
        <button className="btn-ghost" onClick={draftContextualEmail}>
          Draft contextual email
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`template-pick-${runId}`}>
            Email template
          </label>
          <select
            id={`template-pick-${runId}`}
            className="field !w-auto min-w-[14rem] max-w-full !py-2 !text-sm"
            value={selectedTemplateId}
            disabled={templatesBusy || templates.length === 0}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            title="Choose a template, or leave Auto-match to pick by the call’s backed notes"
          >
            <option value={AUTO_MATCH}>
              {suggestedId
                ? `Auto-match · ${
                    templates.find((t) => t.id === suggestedId)?.title ??
                    "best fit"
                  }`
                : "Auto-match · best fit for this call"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {matchingIds.has(t.id) ? " · matches this call" : ""}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost"
            onClick={draftFromTemplate}
            disabled={templatesBusy}
            title={
              selectedMeta
                ? selectedMeta.explainer
                : "Match this call against the template library and draft from backed notes"
            }
          >
            Draft from template
          </button>
        </div>
        <button
          className="btn-ghost"
          onClick={() => syncToHubspot()}
          disabled={!hubspotReady}
          title={
            hubspotReady
              ? "Write momentum + notes to the matching HubSpot deal"
              : "Connect HubSpot in Settings first"
          }
        >
          {hubspotReady ? "Sync to HubSpot" : "HubSpot not connected"}
        </button>
        <a href="/companies" className="btn-ghost">
          Companies
        </a>
        <a href="/reps" className="btn-ghost">
          Reps
        </a>
      </div>
      {selectedMeta && (
        <p className="mt-2 text-[12.5px] text-fg-soft">
          {selectedMeta.explainer}
          {!matchingIds.has(selectedMeta.id) &&
            " · This template’s trigger did not fire on its own; it will still only use backed notes."}
        </p>
      )}
      {syncStatus && <p className="mt-2 text-sm text-fg-muted">{syncStatus}</p>}
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
      {emailStatus && <p className="mt-2 text-sm text-fg-muted">{emailStatus}</p>}
      {draft && (
        <div className="mt-3 rounded-lg border border-edge bg-canvas p-3">
          {draft.templateTitle && (
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-soft">
              {draft.templateTitle}
            </p>
          )}
          <p className="text-sm font-medium">{draft.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">
            {draft.body}
          </p>
        </div>
      )}
    </div>
  );
}
