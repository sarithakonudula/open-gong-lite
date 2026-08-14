"use client";

import Link from "next/link";
import { useState } from "react";
import { AskSearch } from "@/components/electron/AskSearch";

const CARDS = [
  {
    icon: "☁",
    style: "bg-indigo-50 text-indigo-500",
    title: "Uploading recordings",
    body: "Formats, size limits (500MB), and recording links",
    href: "/upload",
  },
  {
    icon: "☺",
    style: "bg-rose-50 text-rose-500",
    title: "Understanding scores",
    body: "How momentum and coverage scores are calculated",
    href: "/how",
  },
  {
    icon: "☷",
    style: "bg-emerald-50 text-emerald-600",
    title: "Coaching reps",
    body: "Trait trends, priorities, and drills with receipts",
    href: "/reps",
  },
  {
    icon: "▤",
    style: "bg-amber-50 text-amber-500",
    title: "Templates",
    body: "Routed follow-ups picked by the call's gated claims",
    href: "/templates",
  },
  {
    icon: "✉",
    style: "bg-sky-50 text-sky-500",
    title: "Draft emails",
    body: "Editing, regenerating, and gate-checked follow-ups",
    href: "/recordings",
  },
  {
    icon: "⚙",
    style: "bg-gray-100 text-gray-500",
    title: "Workspace & admin",
    body: "LLM chain, HubSpot, Slack, language filter",
    href: "/admin",
  },
];

const FAQ = [
  {
    q: "How is the score calculated?",
    a: "For sales calls the score is deal momentum: a deterministic 0–100 built only from claims that passed the evidence gate — verified next steps and buying intent add, open objections and competitor presence subtract, low receipt coverage penalizes. For support and customer-success calls it is receipt coverage (the share of claims backed by the transcript). It updates after every new recording, and every contributing reason carries the transcript line behind it.",
  },
  {
    q: "Can I edit a draft email before sending it?",
    a: "Yes — drafts are never auto-sent. Copy the draft and edit freely. Regenerating uses only verified claims (plus CRM context when HubSpot is connected); a draft that cites an unproven claim is rejected outright, so everything you start from is backed by the call.",
  },
  {
    q: "Why does a note say “not found in the call”?",
    a: "Every claim must cite a verbatim transcript line. When the cited quote can't be re-found (including digit/number-word mismatches), the claim stays visible but demoted — it never reaches emails, the CRM, or coaching. That is deliberate: a false demotion beats a loosened matcher.",
  },
  {
    q: "Which recording links can I paste?",
    a: "Direct media URLs, Fathom shares, Fireflies views, Google Drive file links (auto-normalized), Loom, and Zoom/Gong pages when public. Drive folders and login-walled pages get a specific next step instead of a generic error, and names embedded in the link become the call title.",
  },
];

export function HelpClient() {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const cards = CARDS.filter(
    (c) => !needle || `${c.title} ${c.body}`.toLowerCase().includes(needle),
  );
  const faq = FAQ.filter(
    (f) => !needle || `${f.q} ${f.a}`.toLowerCase().includes(needle),
  );

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Help</h1>

      <div className="mt-4">
        <AskSearch value={q} onChange={setQ} before="Search help articles or" after="a question" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${c.style}`}>
              {c.icon}
            </span>
            <p className="mt-3 font-bold">{c.title}</p>
            <p className="mt-0.5 text-sm text-gray-500">{c.body}</p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Frequently asked
      </p>
      <div className="mt-2 space-y-2">
        {faq.map((f) => (
          <details
            key={f.q}
            className="group rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <summary className="flex cursor-pointer items-center justify-between font-semibold marker:content-none">
              {f.q}
              <span className="text-gray-400 transition group-open:rotate-180">⌄</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4 rounded-xl bg-indigo-50 px-6 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-indigo-500">💬</span>
        <span className="flex-1">
          <span className="block font-semibold">Still need help?</span>
          <span className="block text-sm text-gray-600">
            Our support team usually replies within a few hours.
          </span>
        </span>
        <a
          href="https://github.com/aakashnandakumar/open-gong-lite"
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
