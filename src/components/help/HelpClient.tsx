"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type HelpCard = {
  title: string;
  blurb: string;
  href: string;
  linkLabel: string;
  tile: string;
  icon: React.ReactNode;
};

function icon(path: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {path}
    </svg>
  );
}

const CARDS: HelpCard[] = [
  {
    title: "Uploading recordings",
    blurb:
      "Audio or webm/mp4 up to 100MB, or paste a Fathom, Fireflies, Google Drive, Loom, or Zoom link. Large files are compressed before transcription.",
    href: "/",
    linkLabel: "Go to Upload",
    tile: "bg-brand-soft text-brand",
    icon: icon(
      <>
        <path d="M12 16V5" />
        <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
        <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
      </>,
    ),
  },
  {
    title: "Understanding scores",
    blurb:
      "Momentum is a deterministic deal-progress score (0–100) where every point carries a receipt. Scorecards use 16 methodology packs. The sentiment % is momentum, not tone analysis.",
    href: "/how",
    linkLabel: "How scoring stays honest",
    tile: "bg-positive-soft text-positive",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 13.5 11 10l2.5 2.5L16.5 9" />
      </>,
    ),
  },
  {
    title: "Coaching reps",
    blurb:
      "Trait-level trends across every scored call, plus drills built from the rep's own quoted lines — personalized with receipts, never generic.",
    href: "/reps",
    linkLabel: "Open Reps",
    tile: "bg-warn-soft text-warn",
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" />
        <path d="M16 8.5a2.6 2.6 0 1 0 0-5" />
        <path d="M17.2 15.2c1.9.5 3 1.9 3.3 4.8" />
      </>,
    ),
  },
  {
    title: "Templates",
    blurb:
      "Eight routed follow-up email templates. After every call the highest-priority template whose trigger matches the verified claims writes the draft.",
    href: "/templates",
    linkLabel: "Browse Templates",
    tile: "bg-info-soft text-info",
    icon: icon(
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16" />
        <path d="M9 9v11" />
      </>,
    ),
  },
  {
    title: "Draft emails",
    blurb:
      "Only gate-passed claims can enter a draft. Blocked or unproven notes never ship — if nothing is backed, no draft goes out and the page says so.",
    href: "/recordings",
    linkLabel: "Open a recording's Draft Email tab",
    tile: "bg-brand-soft text-brand",
    icon: icon(
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4.5 7 7.5 6 7.5-6" />
      </>,
    ),
  },
  {
    title: "Citations & the gate",
    blurb:
      "Every note carries a verbatim quote and the line it came from. A 4-step check verifies each citation; notes that fail stay on the page, visibly marked.",
    href: "/how",
    linkLabel: "How the checking works",
    tile: "bg-danger-soft text-danger",
    icon: icon(
      <>
        <path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.4 7 8.9 4.1-1.5 7-4.7 7-8.9v-5z" />
        <path d="m9 11.5 2 2 4-4.5" />
      </>,
    ),
  },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How is the score calculated?",
    a: "The momentum score starts at 50. Verified next steps and buying intent add points; a call with no verified next step loses points. Every move carries the quote and line that caused it. When a methodology pack scores the call, the scorecard is a separate 0–100 built from trait-level evidence.",
  },
  {
    q: "Can I edit a draft email before sending it?",
    a: "Yes — drafts are copy-out. Nothing sends automatically; you copy the draft into your own email client, edit freely, and send it yourself.",
  },
  {
    q: "What does “not found in the call” mean?",
    a: "The AI offered a quote as its source, but the gate could not locate that sentence anywhere in the call. The note stays on the page, struck through and marked, and it never reaches the follow-up email.",
  },
  {
    q: "Are share links private?",
    a: "A share link uses an unguessable token, but anyone who has the link can open it. Shared pages hide the audio player and every workspace action — they show the notes, transcript text, and receipts only.",
  },
  {
    q: "What happens when someone gives the AI instructions on a call?",
    a: "The line is quarantined: it is flagged in the transcript, anything standing on that moment is struck through, and it is barred from the follow-up email. A call that talks to your AI is an attack on your notes, and an attack never counts as a source.",
  },
];

export function HelpClient() {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const cards = useMemo(
    () =>
      q
        ? CARDS.filter((c) =>
            `${c.title} ${c.blurb}`.toLowerCase().includes(q),
          )
        : CARDS,
    [q],
  );
  const faqs = useMemo(
    () =>
      q ? FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q)) : FAQS,
    [q],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Help</h1>

      <div className="relative mt-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-fg-soft"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className="field !rounded-xl !py-3 !pl-11"
          type="search"
          placeholder="Search help topics"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <p className="mt-3 text-sm text-fg-muted">
        New here? Start with{" "}
        <Link href="/how" className="receipt-link">
          How the checking works — the full walkthrough
        </Link>
        .
      </p>

      {cards.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="card group p-5 transition hover:border-brand/50"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.tile}`}
              >
                {card.icon}
              </span>
              <h2 className="mt-3 text-[15px] font-semibold text-fg">
                {card.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
                {card.blurb}
              </p>
              <p className="mt-2 text-[13px] font-medium text-brand opacity-0 transition group-hover:opacity-100">
                {card.linkLabel} →
              </p>
            </Link>
          ))}
        </div>
      )}

      {faqs.length > 0 && (
        <>
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
            Frequently asked
          </p>
          <div className="card mt-3 divide-y divide-[var(--border)]">
            {faqs.map((faq) => (
              <details key={faq.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="text-fg-soft transition group-open:rotate-180">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden
                    >
                      <path d="m5.5 9.5 6.5 6 6.5-6" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-2 pr-8 text-sm leading-relaxed text-fg-muted">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </>
      )}

      {cards.length === 0 && faqs.length === 0 && (
        <div className="card mt-6 px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-fg">
            Nothing matches &ldquo;{query}&rdquo;
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Try a different word, or read the full walkthrough on the How page.
          </p>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-brand-soft px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-brand">
            {icon(
              <>
                <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.38-4.1-1.05L3 20l1.05-5.4A8.5 8.5 0 1 1 21 11.5z" />
              </>,
            )}
          </span>
          <div>
            <p className="text-[15px] font-semibold text-fg">Still need help?</p>
            <p className="text-[13px] text-fg-muted">
              OpenGong Lite is open source — questions and bugs live on GitHub.
            </p>
          </div>
        </div>
        <a
          href="https://github.com/sarithakonudula/open-gong-lite"
          target="_blank"
          rel="noreferrer"
          className="btn-primary text-sm"
        >
          Open an issue
        </a>
      </div>
    </div>
  );
}
