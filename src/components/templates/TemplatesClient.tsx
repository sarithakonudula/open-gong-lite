"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FollowUpTemplateView,
  TemplateBlockView,
} from "@/components/templates/template-view-types";
import type { MeetingTemplateFixture } from "@/lib/fixtures/meeting-templates";

const STORAGE_KEY = "og-template-customizations";

type FollowUpCustomization = {
  subject: string;
  blocks: TemplateBlockView[];
};

type Customizations = {
  followUps: Record<string, FollowUpCustomization>;
  meetings: Record<string, { prompt: string }>;
};

const EMPTY_CUSTOMIZATIONS: Customizations = {
  followUps: {},
  meetings: {},
};

function SampleChip() {
  return <span className="chip chip-muted">Sample</span>;
}

function loadCustomizations(): Customizations {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CUSTOMIZATIONS;
    const parsed = JSON.parse(raw) as Partial<Customizations>;
    return {
      followUps: parsed.followUps ?? {},
      meetings: parsed.meetings ?? {},
    };
  } catch {
    return EMPTY_CUSTOMIZATIONS;
  }
}

function persistCustomizations(next: Customizations) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // best effort — private mode / quota
  }
}

export function TemplatesClient({
  followUps,
  meetingFixtures,
}: {
  followUps: FollowUpTemplateView[];
  meetingFixtures: MeetingTemplateFixture[];
}) {
  const [selectedId, setSelectedId] = useState<string>(
    followUps[0]?.id ?? meetingFixtures[0]?.id ?? "",
  );
  const [customizations, setCustomizations] =
    useState<Customizations>(EMPTY_CUSTOMIZATIONS);
  const [editing, setEditing] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBlocks, setDraftBlocks] = useState<TemplateBlockView[]>([]);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const next = loadCustomizations();
    void Promise.resolve().then(() => setCustomizations(next));
  }, []);

  const selectedFollowUp = useMemo(
    () => followUps.find((t) => t.id === selectedId) ?? null,
    [followUps, selectedId],
  );
  const selectedFixture = useMemo(
    () => meetingFixtures.find((t) => t.id === selectedId) ?? null,
    [meetingFixtures, selectedId],
  );

  const followUpView = useMemo(() => {
    if (!selectedFollowUp) return null;
    const override = customizations.followUps[selectedFollowUp.id];
    if (!override) return selectedFollowUp;
    return {
      ...selectedFollowUp,
      subject: override.subject,
      blocks: override.blocks,
    };
  }, [selectedFollowUp, customizations]);

  const fixtureView = useMemo(() => {
    if (!selectedFixture) return null;
    const override = customizations.meetings[selectedFixture.id];
    if (!override) return selectedFixture;
    return { ...selectedFixture, prompt: override.prompt };
  }, [selectedFixture, customizations]);

  const isCustomized = Boolean(
    (selectedFollowUp && customizations.followUps[selectedFollowUp.id]) ||
      (selectedFixture && customizations.meetings[selectedFixture.id]),
  );

  function selectTemplate(id: string) {
    setSelectedId(id);
    setEditing(false);
    setFlash(null);
  }

  function startCustomize() {
    if (followUpView) {
      setDraftSubject(followUpView.subject);
      setDraftBlocks(followUpView.blocks.map((b) => ({ ...b })));
      setEditing(true);
      setFlash(null);
      return;
    }
    if (fixtureView) {
      setDraftPrompt(fixtureView.prompt);
      setEditing(true);
      setFlash(null);
    }
  }

  function cancelCustomize() {
    setEditing(false);
    setFlash(null);
  }

  function saveCustomize() {
    if (selectedFollowUp) {
      const next: Customizations = {
        ...customizations,
        followUps: {
          ...customizations.followUps,
          [selectedFollowUp.id]: {
            subject: draftSubject.trim() || selectedFollowUp.subject,
            blocks: draftBlocks,
          },
        },
      };
      setCustomizations(next);
      persistCustomizations(next);
      setEditing(false);
      setFlash("Customization saved on this browser.");
      return;
    }
    if (selectedFixture) {
      const next: Customizations = {
        ...customizations,
        meetings: {
          ...customizations.meetings,
          [selectedFixture.id]: {
            prompt: draftPrompt.trim() || selectedFixture.prompt,
          },
        },
      };
      setCustomizations(next);
      persistCustomizations(next);
      setEditing(false);
      setFlash("Customization saved on this browser.");
    }
  }

  function resetCustomize() {
    if (selectedFollowUp) {
      const followUpsNext = { ...customizations.followUps };
      delete followUpsNext[selectedFollowUp.id];
      const next = { ...customizations, followUps: followUpsNext };
      setCustomizations(next);
      persistCustomizations(next);
      setEditing(false);
      setFlash("Restored the shipped template.");
      return;
    }
    if (selectedFixture) {
      const meetingsNext = { ...customizations.meetings };
      delete meetingsNext[selectedFixture.id];
      const next = { ...customizations, meetings: meetingsNext };
      setCustomizations(next);
      persistCustomizations(next);
      setEditing(false);
      setFlash("Restored the shipped template.");
    }
  }

  function updateBlock(index: number, patch: Partial<TemplateBlockView>) {
    setDraftBlocks((blocks) =>
      blocks.map((block, i) => {
        if (i !== index) return block;
        if (block.type === "text" && "text" in patch) {
          return { ...block, text: String(patch.text ?? "") };
        }
        if (block.type === "instruction" && "text" in patch) {
          return { ...block, text: String(patch.text ?? "") };
        }
        if (block.type === "slot") {
          return {
            ...block,
            ...("label" in patch && patch.label != null
              ? { label: String(patch.label) }
              : {}),
            ...("hint" in patch ? { hint: String(patch.hint ?? "") } : {}),
          };
        }
        return block;
      }),
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">
        Meeting templates
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-fg-muted">
        Every analyzed call already routes through these — the highest-priority
        template whose trigger fires writes the second draft on the call&rsquo;s
        Draft Email tab. Customize edits the preview on this browser; live
        routing still uses the shipped library.
      </p>

      {flash && (
        <p className="mt-4 rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-brand">
          {flash}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
            Templates for
          </p>
          <p className="mt-3 text-[12px] font-semibold text-fg-muted">
            Follow-up emails
          </p>
          <div className="mt-1.5 space-y-1">
            {followUps.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-[13.5px] font-medium transition ${
                  selectedId === t.id
                    ? "border-brand/50 bg-brand-soft text-brand"
                    : "border-edge bg-surface text-fg hover:border-brand/30"
                }`}
              >
                {t.title}
                {customizations.followUps[t.id] ? (
                  <span className="mt-0.5 block text-[11px] font-normal text-fg-soft">
                    Customized
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <p className="text-[12px] font-semibold text-fg-muted">
              Meeting notes
            </p>
            <SampleChip />
          </div>
          <div className="mt-1.5 space-y-1">
            {meetingFixtures.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-[13.5px] font-medium transition ${
                  selectedId === t.id
                    ? "border-brand/50 bg-brand-soft text-brand"
                    : "border-edge bg-surface text-fg hover:border-brand/30"
                }`}
              >
                {t.title}
                {customizations.meetings[t.id] ? (
                  <span className="mt-0.5 block text-[11px] font-normal text-fg-soft">
                    Customized
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="card min-w-0 p-6">
          {followUpView ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-fg">
                    {followUpView.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="chip chip-brand">
                      Live in the routing engine
                    </span>
                    {isCustomized && (
                      <span className="chip chip-muted">Customized here</span>
                    )}
                    <span className="text-[12px] text-fg-soft">
                      priority {followUpView.priority} · ≤
                      {followUpView.wordLimit} words
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary !py-1.5 text-[13px]"
                        onClick={saveCustomize}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 text-[13px]"
                        onClick={cancelCustomize}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 text-[13px]"
                        onClick={startCustomize}
                      >
                        ✎ Customize
                      </button>
                      {isCustomized && (
                        <button
                          type="button"
                          className="btn-ghost !py-1.5 text-[13px]"
                          onClick={resetCustomize}
                        >
                          Reset
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-fg-muted">
                {followUpView.situation}
              </p>
              <p className="mt-1 text-[13px] text-fg-soft">
                {followUpView.explainer}
              </p>

              {followUpView.rules.length > 0 && (
                <div className="mt-4 rounded-lg border border-positive/30 bg-positive-soft px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-positive">
                    Live routing — when this template is picked
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-fg">
                    {followUpView.rules.map((rule) => (
                      <li key={rule.mode}>
                        <span className="font-semibold">
                          Fires when {rule.mode}:
                        </span>{" "}
                        {rule.clauses.join(" · ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
                  Draft structure
                </p>
                {editing ? (
                  <label className="mt-2 block text-[12.5px] font-medium text-fg-muted">
                    Subject
                    <input
                      className="field mt-1 text-sm"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      maxLength={200}
                    />
                  </label>
                ) : (
                  <p className="mt-1 text-[13px] text-fg-soft">
                    Subject: &ldquo;{followUpView.subject}&rdquo;
                  </p>
                )}
              </div>

              <div className="mt-2 space-y-2.5 rounded-xl border border-edge bg-canvas p-4">
                {(editing ? draftBlocks : followUpView.blocks).map(
                  (block, i) =>
                    block.type === "text" ? (
                      editing ? (
                        <textarea
                          key={i}
                          className="field min-h-20 w-full text-[13.5px] leading-relaxed"
                          value={block.text}
                          onChange={(e) =>
                            updateBlock(i, { text: e.target.value })
                          }
                          maxLength={4000}
                        />
                      ) : (
                        <p
                          key={i}
                          className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg"
                        >
                          {block.text}
                        </p>
                      )
                    ) : block.type === "slot" ? (
                      <div
                        key={i}
                        className="rounded-lg border border-dashed border-brand/40 bg-brand-soft/50 px-3 py-2"
                      >
                        {editing ? (
                          <div className="space-y-2">
                            <input
                              className="field text-[12.5px]"
                              value={block.label}
                              onChange={(e) =>
                                updateBlock(i, { label: e.target.value })
                              }
                              maxLength={120}
                            />
                            <p className="text-[12px] text-fg-muted">
                              pulls verified claims from{" "}
                              {block.section.replace(/_/g, " ")}
                              {block.limit ? `, limit ${block.limit}` : ""}
                            </p>
                            <input
                              className="field text-[12px]"
                              placeholder="Hint"
                              value={block.hint ?? ""}
                              onChange={(e) =>
                                updateBlock(i, { hint: e.target.value })
                              }
                              maxLength={300}
                            />
                          </div>
                        ) : (
                          <>
                            <p className="text-[12.5px] font-semibold text-brand">
                              {"{{"} {block.label}: pulls verified claims from{" "}
                              {block.section.replace(/_/g, " ")}
                              {block.limit ? `, limit ${block.limit}` : ""} {"}}"}
                            </p>
                            {block.hint && (
                              <p className="mt-0.5 text-[12px] text-fg-muted">
                                {block.hint}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ) : editing ? (
                      <textarea
                        key={i}
                        className="field min-h-16 w-full text-[12.5px] italic leading-relaxed"
                        value={block.text}
                        onChange={(e) =>
                          updateBlock(i, { text: e.target.value })
                        }
                        maxLength={2000}
                      />
                    ) : (
                      <p
                        key={i}
                        className="text-[12.5px] italic leading-relaxed text-fg-soft"
                      >
                        To the model: {block.text}
                      </p>
                    ),
                )}
              </div>
            </>
          ) : fixtureView ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-fg">
                    {fixtureView.title}
                  </h2>
                  <SampleChip />
                  {isCustomized && (
                    <span className="chip chip-muted">Customized here</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary !py-1.5 text-[13px]"
                        onClick={saveCustomize}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 text-[13px]"
                        onClick={cancelCustomize}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 text-[13px]"
                        onClick={startCustomize}
                      >
                        ✎ Customize
                      </button>
                      {isCustomized && (
                        <button
                          type="button"
                          className="btn-ghost !py-1.5 text-[13px]"
                          onClick={resetCustomize}
                        >
                          Reset
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1 text-[13px] text-fg-soft">
                Notes structure (preview)
              </p>
              {editing ? (
                <textarea
                  className="field mt-4 min-h-80 w-full font-sans text-[13.5px] leading-relaxed"
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  maxLength={12000}
                />
              ) : (
                <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-edge bg-canvas p-4 font-sans text-[13.5px] leading-relaxed text-fg">
                  {fixtureView.prompt}
                </pre>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-muted">Select a template.</p>
          )}
        </div>
      </div>
    </div>
  );
}
