"use client";

import { useMemo, useState } from "react";
import type {
  FollowUpTemplateView,
} from "@/components/templates/template-view-types";
import type { MeetingTemplateFixture } from "@/lib/fixtures/meeting-templates";

type Tab = "suggested" | "personal" | "team";

function SampleChip() {
  return <span className="chip chip-muted">Sample</span>;
}

export function TemplatesClient({
  followUps,
  meetingFixtures,
}: {
  followUps: FollowUpTemplateView[];
  meetingFixtures: MeetingTemplateFixture[];
}) {
  const [tab, setTab] = useState<Tab>("suggested");
  const [selectedId, setSelectedId] = useState<string>(
    followUps[0]?.id ?? meetingFixtures[0]?.id ?? "",
  );
  const [note, setNote] = useState<string | null>(null);

  const selectedFollowUp = useMemo(
    () => followUps.find((t) => t.id === selectedId) ?? null,
    [followUps, selectedId],
  );
  const selectedFixture = useMemo(
    () => meetingFixtures.find((t) => t.id === selectedId) ?? null,
    [meetingFixtures, selectedId],
  );

  function tabClass(name: Tab) {
    return `border-b-2 px-1 pb-2.5 text-sm font-medium transition ${
      tab === name
        ? "border-brand text-fg"
        : "border-transparent text-fg-muted hover:text-fg"
    }`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Meeting templates
        </h1>
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={() =>
            setNote("Sample — template authoring isn't wired yet.")
          }
        >
          Create personal/team template →
        </button>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-fg-muted">
        Every analyzed call already routes through these — the highest-priority
        template whose trigger fires writes the second draft on the call&rsquo;s
        Draft Email tab.
      </p>

      <div className="mt-6 flex gap-6 border-b border-edge">
        <button type="button" className={tabClass("suggested")} onClick={() => setTab("suggested")}>
          Suggested templates
        </button>
        <button type="button" className={tabClass("personal")} onClick={() => setTab("personal")}>
          Personal templates
        </button>
        <button type="button" className={tabClass("team")} onClick={() => setTab("team")}>
          Team templates
        </button>
      </div>

      {note && (
        <p className="mt-4 rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-brand">
          {note}
        </p>
      )}

      {tab !== "suggested" ? (
        <div className="card mt-6 px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-fg">
            No {tab} templates yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
            {tab === "personal"
              ? "Templates you customize will live here, private to you."
              : "Templates shared with your workspace will live here."}{" "}
            Authoring lands after launch — the suggested library routes every
            call in the meantime.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_320px]">
          {/* Left: template list */}
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
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-[13.5px] font-medium transition ${
                    selectedId === t.id
                      ? "border-brand/50 bg-brand-soft text-brand"
                      : "border-edge bg-surface text-fg hover:border-brand/30"
                  }`}
                >
                  {t.title}
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
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-[13.5px] font-medium transition ${
                    selectedId === t.id
                      ? "border-brand/50 bg-brand-soft text-brand"
                      : "border-edge bg-surface text-fg hover:border-brand/30"
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>

          {/* Middle: preview */}
          <div className="card min-w-0 p-6">
            {selectedFollowUp ? (
              <>
                <h2 className="text-xl font-semibold text-fg">
                  {selectedFollowUp.title}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="chip chip-brand">
                    Live in the routing engine
                  </span>
                  <span className="text-[12px] text-fg-soft">
                    priority {selectedFollowUp.priority} · ≤
                    {selectedFollowUp.wordLimit} words
                  </span>
                </div>
                <p className="mt-3 text-sm text-fg-muted">
                  {selectedFollowUp.situation}
                </p>
                <p className="mt-1 text-[13px] text-fg-soft">
                  {selectedFollowUp.explainer}
                </p>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
                    Draft structure{" "}
                    <span className="normal-case tracking-normal">
                      (subject: &ldquo;{selectedFollowUp.subject}&rdquo;)
                    </span>
                  </p>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 text-[13px]"
                    onClick={() =>
                      setNote("Sample — editing lands after launch.")
                    }
                  >
                    ✎ Customize
                  </button>
                </div>
                <div className="mt-2 space-y-2.5 rounded-xl border border-edge bg-canvas p-4">
                  {selectedFollowUp.blocks.map((block, i) =>
                    block.type === "text" ? (
                      <p
                        key={i}
                        className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg"
                      >
                        {block.text}
                      </p>
                    ) : block.type === "slot" ? (
                      <div
                        key={i}
                        className="rounded-lg border border-dashed border-brand/40 bg-brand-soft/50 px-3 py-2"
                      >
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
                      </div>
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
            ) : selectedFixture ? (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-fg">
                    {selectedFixture.title}
                  </h2>
                  <SampleChip />
                </div>
                <p className="mt-1 text-[13px] text-fg-soft">
                  Notes structure (preview)
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
                    Notes structure
                  </p>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 text-[13px]"
                    onClick={() =>
                      setNote("Sample — editing lands after launch.")
                    }
                  >
                    ✎ Customize
                  </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-edge bg-canvas p-4 font-sans text-[13.5px] leading-relaxed text-fg">
                  {selectedFixture.prompt}
                </pre>
              </>
            ) : (
              <p className="text-sm text-fg-muted">Select a template.</p>
            )}
          </div>

          {/* Right: automation */}
          <div className="h-fit rounded-xl bg-[#f2f3f6] p-5">
            <h3 className="text-[15px] font-semibold text-fg">
              Automate this template for future meetings
            </h3>

            {selectedFollowUp && (
              <div className="mt-3 rounded-lg border border-positive/30 bg-positive-soft px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-positive">
                  Live routing rule — picks this template automatically
                </p>
                <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-fg">
                  {selectedFollowUp.rules.map((rule) => (
                    <li key={rule.mode}>
                      <span className="font-semibold">Fires when {rule.mode}:</span>{" "}
                      {rule.clauses.join(" · ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <label className="block text-[12.5px] font-medium text-fg-muted">
                Type of the meeting *
                <select className="field mt-1 bg-white text-sm" defaultValue="both">
                  <option value="both">Internal and external meetings</option>
                  <option value="external">External meetings only</option>
                  <option value="internal">Internal meetings only</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-fg-muted">
                When meeting title contains the word
                <input
                  className="field mt-1 bg-white text-sm"
                  placeholder="Type a word that always appears in the title"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-fg-muted">
                When meeting participants include
                <input
                  className="field mt-1 bg-white text-sm"
                  placeholder="Type the email of a participant"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-fg-muted">
                When participants, at the time of the meeting, were in
                <select className="field mt-1 bg-white text-sm" defaultValue="any">
                  <option value="any">Any CRM Deal Stage</option>
                  <option value="discovery">Discovery</option>
                  <option value="evaluation">Evaluation</option>
                  <option value="decision">Decision</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-fg-muted">
                Auto-sharing via email
                <select className="field mt-1 bg-white text-sm" defaultValue="all">
                  <option value="all">With all invitees</option>
                  <option value="internal">Internal only</option>
                  <option value="none">Off</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              className="btn-primary mt-4 w-full text-sm"
              onClick={() =>
                setNote(
                  "Sample — automation rules aren't wired to the pipeline yet.",
                )
              }
            >
              Set as personal/team template
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center">
              <SampleChip />
              <span className="text-[11.5px] text-fg-soft">
                Form fields are sample data
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
