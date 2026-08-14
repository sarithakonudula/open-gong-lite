"use client";

// Meeting templates screen per the design: Suggested / Personal / Team tabs,
// a category selector, the notes-structure preview with Customize, and the
// "Automate this template for future meetings" criteria panel. Templates and
// their routing come from the real library; automation criteria and personal
// copies persist locally (this build has no meeting-calendar backend).

import { useEffect, useState } from "react";

type Block = {
  type: string;
  role?: string;
  label?: string;
  text?: string;
  section?: string;
  hint?: string;
};

type Template = {
  id: string;
  title: string;
  short: string;
  subject: string;
  wordLimit?: number;
  explainer: string | null;
  routing: { trigger: Record<string, Array<{ section?: string }>> };
  blocks: Block[];
};

type AutomationRule = {
  templateId: string;
  meetingType: string;
  titleContains: string;
  participantEmail: string;
  dealStage: string;
  autoShare: string;
  savedAt: string;
};

const TABS = ["Suggested templates", "Personal templates", "Team templates"] as const;

export function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Suggested templates");
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Record<string, AutomationRule>>({});
  const [form, setForm] = useState({
    meetingType: "Internal and external meetings",
    titleContains: "",
    participantEmail: "",
    dealStage: "Any CRM Deal Stage",
    autoShare: "With all invitees",
  });
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates ?? []);
        setSelected(d.templates?.[0]?.id ?? null);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
    const t = setTimeout(() => {
      try {
        setRules(JSON.parse(localStorage.getItem("electron.templateRules") ?? "{}"));
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const active = templates.find((t) => t.id === selected) ?? null;
  const personal = templates.filter((t) => rules[t.id]);
  const list = tab === "Personal templates" ? personal : templates;

  function saveRule() {
    if (!active) return;
    const next = {
      ...rules,
      [active.id]: { templateId: active.id, ...form, savedAt: new Date().toISOString() },
    };
    setRules(next);
    localStorage.setItem("electron.templateRules", JSON.stringify(next));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300";

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Meeting templates</h1>

      <div className="mt-4 flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((t) => {
            const disabled = t === "Team templates";
            return (
              <button
                key={t}
                disabled={disabled}
                onClick={() => setTab(t)}
                className={`border-b-2 pb-2 text-sm font-medium ${
                  tab === t
                    ? "border-indigo-600 text-indigo-600"
                    : disabled
                      ? "border-transparent text-gray-300"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
                title={disabled ? "Single-workspace build — team sharing not available" : undefined}
              >
                {t}
              </button>
            );
          })}
        </div>
        <button
          onClick={saveRule}
          className="mb-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Create personal/team template ›
        </button>
      </div>

      {loading && <p className="mt-6 text-sm text-gray-500">Loading templates…</p>}

      {!loading && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr_320px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Templates for
            </p>
            <select className={inputCls} defaultValue="Follow-up emails">
              <option>Follow-up emails</option>
            </select>
            <div className="mt-3 space-y-1">
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`block w-full truncate rounded-lg border px-3 py-2.5 text-left text-sm ${
                    t.id === selected
                      ? "border-indigo-200 bg-indigo-50 font-medium text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t.title}
                </button>
              ))}
              {list.length === 0 && (
                <p className="px-1 text-sm text-gray-400">
                  No personal templates yet — set one from Suggested.
                </p>
              )}
            </div>
          </div>

          {active && (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">{active.title}</h2>
                <div className="mt-1 flex items-center gap-3">
                  <p className="text-xs text-gray-400">
                    Notes structure <span className="uppercase">(preview)</span>
                  </p>
                  <button
                    onClick={saveRule}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    ✎ Customize
                  </button>
                </div>
                {active.explainer && (
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">
                    {active.explainer}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  Subject: “{active.subject}”
                  {active.wordLimit ? ` · ≤${active.wordLimit} words` : ""}
                </p>
                <div className="mt-4 space-y-3">
                  {active.blocks.map((b, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 px-3.5 py-2.5 text-sm">
                      {b.type === "slot" ? (
                        <>
                          <span className="font-semibold text-gray-800">
                            {b.label ?? b.role}{" "}
                            <span className="text-xs font-normal text-indigo-500">
                              ← {b.section} claims
                            </span>
                          </span>
                          {b.hint && (
                            <span className="mt-0.5 block text-xs text-gray-500">{b.hint}</span>
                          )}
                        </>
                      ) : b.type === "instruction" ? (
                        <span className="text-xs italic text-gray-500">{b.text}</span>
                      ) : (
                        <span className="text-gray-700">{b.text}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-fit rounded-xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="font-bold">Automate this template for future meetings</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Automatically apply this template to future meetings that match
                  this criteria:
                </p>

                <label className="mt-4 block text-xs font-medium text-gray-600">
                  Type of the meeting *
                  <select
                    className={inputCls}
                    value={form.meetingType}
                    onChange={(e) => setForm((f) => ({ ...f, meetingType: e.target.value }))}
                  >
                    <option>Internal and external meetings</option>
                    <option>External meetings only</option>
                    <option>Internal meetings only</option>
                  </select>
                </label>

                <label className="mt-3 block text-xs font-medium text-gray-600">
                  When meeting title contains the word ⓘ
                  <input
                    className={inputCls}
                    placeholder="Type a word that always appear on the title"
                    value={form.titleContains}
                    onChange={(e) => setForm((f) => ({ ...f, titleContains: e.target.value }))}
                  />
                </label>

                <label className="mt-3 block text-xs font-medium text-gray-600">
                  When meeting participants include
                  <input
                    className={inputCls}
                    placeholder="Type the email of a participant"
                    value={form.participantEmail}
                    onChange={(e) => setForm((f) => ({ ...f, participantEmail: e.target.value }))}
                  />
                </label>

                <label className="mt-3 block text-xs font-medium text-gray-600">
                  When participants, at the time of the meeting, were in
                  <select
                    className={inputCls}
                    value={form.dealStage}
                    onChange={(e) => setForm((f) => ({ ...f, dealStage: e.target.value }))}
                  >
                    <option>Any CRM Deal Stage</option>
                    <option>Discovery</option>
                    <option>Demo</option>
                    <option>Proposal</option>
                    <option>Negotiation</option>
                  </select>
                </label>

                <label className="mt-3 block text-xs font-medium text-gray-600">
                  Auto-sharing via email
                  <select
                    className={inputCls}
                    value={form.autoShare}
                    onChange={(e) => setForm((f) => ({ ...f, autoShare: e.target.value }))}
                  >
                    <option>With all invitees</option>
                    <option>Only me</option>
                    <option>Off</option>
                  </select>
                </label>

                <button
                  onClick={saveRule}
                  className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {savedFlash ? "Saved ✓" : rules[active.id] ? "Update personal/team template" : "Set as personal/team template"}
                </button>
                <p className="mt-3 text-center text-xs">
                  <a href="/help" className="font-medium text-indigo-600 hover:underline">
                    Discover 5,000+ integrations
                  </a>{" "}
                  <span className="text-gray-400">for automated sharing</span>
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                  On this self-hosted build, criteria are saved locally and the
                  template still routes automatically from the call&rsquo;s
                  gate-passed claims ({Object.keys(active.routing.trigger).map((op) =>
                    (active.routing.trigger[op] ?? []).map((c) => c.section).filter(Boolean).join(", "),
                  ).filter(Boolean).join("; ") || "any"}).
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
