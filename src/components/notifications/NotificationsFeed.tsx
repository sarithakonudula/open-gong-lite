"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SampleDataControls } from "@/components/SampleDataControls";
import type { AppNotification, NotificationKind } from "@/lib/notifications";

const READ_KEY = "og-notifications-read";

const TILE: Record<NotificationKind, { className: string; icon: React.ReactNode }> = {
  risk: {
    className: "bg-danger-soft text-danger",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M12 4 2.8 19.5h18.4z" />
        <path d="M12 10v4" />
        <path d="M12 17.2h.01" />
      </svg>
    ),
  },
  digest: {
    className: "bg-warn-soft text-warn",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 14.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5" />
        <path d="M9 10h.01M15 10h.01" />
      </svg>
    ),
  },
  positive: {
    className: "bg-positive-soft text-positive",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    ),
  },
  processed: {
    className: "bg-info-soft text-info",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M12 19V6" />
        <path d="m6.5 11.5 5.5-5.5 5.5 5.5" />
      </svg>
    ),
  },
  highscore: {
    className: "bg-warn-soft text-warn",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" />
        <path d="m17 5 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5L16 7z" />
      </svg>
    ),
  },
  template: {
    className: "bg-canvas text-fg-muted",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16" />
        <path d="M9 9v11" />
      </svg>
    ),
  },
};

function relativeLabel(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  const hours = Math.max(0, Math.floor((now.getTime() - then) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function groupLabel(iso: string, now: Date): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const then = new Date(iso).getTime();
  if (then >= startOfToday.getTime()) return "Today";
  if (then >= startOfToday.getTime() - 86_400_000) return "Yesterday";
  if (then >= startOfToday.getTime() - 6 * 86_400_000) return "Earlier this week";
  return "Earlier";
}

export function NotificationsFeed({ items }: { items: AppNotification[] }) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(READ_KEY);
        if (raw) setReadIds(new Set(JSON.parse(raw) as string[]));
      } catch {
        // ignore
      }
      setNow(new Date());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  function markAllRead() {
    const all = items.map((n) => n.id);
    setReadIds(new Set(all));
    try {
      window.localStorage.setItem(READ_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }

  const groups = useMemo(() => {
    const anchor = now ?? (items[0] ? new Date(items[0].at) : new Date(0));
    const map = new Map<string, AppNotification[]>();
    for (const item of items) {
      const label = groupLabel(item.at, anchor);
      map.set(label, [...(map.get(label) ?? []), item]);
    }
    const order = ["Today", "Yesterday", "Earlier this week", "Earlier"];
    return order
      .filter((label) => map.has(label))
      .map((label) => ({ label, items: map.get(label)! }));
  }, [items, now]);

  const unreadCount = hydrated
    ? items.filter((n) => !readIds.has(n.id)).length
    : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Notifications
        </h1>
        <button
          type="button"
          className="receipt-link text-sm"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          Mark all as read
        </button>
      </div>

      <div className="mt-6">
        <SampleDataControls compact afterHref="/notifications" />
      </div>

      {items.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">
            No notifications yet
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Recording, deal-risk, and coaching events will appear here as calls
            are analyzed.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
              {group.label}
            </p>
            <div className="mt-2 space-y-2">
              {group.items.map((item) => {
                const unread = hydrated && !readIds.has(item.id);
                const tile = TILE[item.kind];
                const body = (
                  <div
                    className={`flex gap-3.5 rounded-xl px-4 py-3.5 transition ${
                      unread ? "bg-brand-soft/60" : "bg-surface"
                    } border border-edge hover:border-brand/40`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tile.className}`}
                    >
                      {tile.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14.5px] font-semibold text-fg">
                          {item.title}
                        </p>
                        {item.sample && (
                          <span className="chip chip-muted">Sample</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13.5px] leading-snug text-fg-muted">
                        {item.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[12px] text-fg-soft">
                        {now ? relativeLabel(item.at, now) : ""}
                      </span>
                      {unread && (
                        <span className="h-2 w-2 rounded-full bg-brand" />
                      )}
                    </div>
                  </div>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} className="block">
                    {body}
                  </Link>
                ) : (
                  <div key={item.id}>{body}</div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
