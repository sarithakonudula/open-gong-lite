"use client";

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

export function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates ?? []);
        setSelected(d.templates?.[0]?.id ?? null);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const active = templates.find((t) => t.id === selected) ?? null;

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Meeting templates</h1>
      <p className="mt-1 text-sm text-gray-500">
        Routed follow-ups: the call&rsquo;s gated claims pick the template, a
        free model drafts it, the gate checks every line.
      </p>

      {loading && <p className="mt-6 text-sm text-gray-500">Loading templates…</p>}

      {!loading && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_300px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Templates for follow-ups
            </p>
            <div className="mt-2 space-y-1">
              {templates.map((t) => (
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
            </div>
          </div>

          {active && (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">{active.title}</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Notes structure (preview) · subject: “{active.subject}”
                  {active.wordLimit ? ` · ≤${active.wordLimit} words` : ""}
                </p>
                {active.explainer && (
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">
                    {active.explainer}
                  </p>
                )}
                <div className="mt-4 space-y-3">
                  {active.blocks.map((b, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 px-3.5 py-2.5 text-sm">
                      {b.type === "slot" ? (
                        <>
                          <span className="font-semibold text-gray-800">
                            {b.label ?? b.role} <span className="text-xs font-normal text-indigo-500">← {b.section} claims</span>
                          </span>
                          {b.hint && <span className="mt-0.5 block text-xs text-gray-500">{b.hint}</span>}
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
                <h3 className="font-bold">Automatic routing</h3>
                <p className="mt-1 text-xs text-gray-500">
                  This template is picked automatically when the call&rsquo;s
                  gated claims match its trigger:
                </p>
                <div className="mt-3 space-y-2">
                  {Object.entries(active.routing.trigger).map(([op, conds]) => (
                    <div key={op}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {op.replace("_", " ")}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {(conds ?? []).map((c, i) => (
                          <li key={i} className="rounded-md bg-white px-2.5 py-1.5 text-xs text-gray-600 ring-1 ring-gray-200">
                            verified claim in <span className="font-semibold">{c.section ?? "any section"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-gray-400">
                  Routing runs over gate-passed claims only — a template can
                  never fire on an unproven or injected line.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
