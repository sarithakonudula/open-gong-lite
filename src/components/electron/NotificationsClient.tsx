"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  kind: "risk" | "coaching" | "positive" | "recording" | "performer" | "template";
  title: string;
  body: string;
  at: string;
  href: string | null;
};

const ICON: Record<Item["kind"], { glyph: string; style: string }> = {
  risk: { glyph: "⚠", style: "bg-red-50 text-red-500" },
  coaching: { glyph: "☺", style: "bg-rose-50 text-rose-500" },
  positive: { glyph: "✓", style: "bg-emerald-50 text-emerald-600" },
  recording: { glyph: "↑", style: "bg-sky-50 text-sky-500" },
  performer: { glyph: "☆", style: "bg-amber-50 text-amber-500" },
  template: { glyph: "▤", style: "bg-gray-100 text-gray-500" },
};

function ago(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function groupOf(iso: string): "TODAY" | "YESTERDAY" | "EARLIER THIS WEEK" {
  if (!iso) return "EARLIER THIS WEEK";
  const hours = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (hours < 24) return "TODAY";
  if (hours < 48) return "YESTERDAY";
  return "EARLIER THIS WEEK";
}

export function NotificationsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setRead(new Set(JSON.parse(localStorage.getItem("electron.read") ?? "[]")));
      } catch {
        // ignore
      }
    }, 0);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setItems(d.notifications ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    return () => clearTimeout(t);
  }, []);

  function markAllRead() {
    const all = new Set(items.map((i) => i.id));
    setRead(all);
    localStorage.setItem("electron.read", JSON.stringify([...all]));
  }

  const groups: Array<["TODAY" | "YESTERDAY" | "EARLIER THIS WEEK", Item[]]> = [
    ["TODAY", []],
    ["YESTERDAY", []],
    ["EARLIER THIS WEEK", []],
  ];
  for (const item of items) {
    groups.find(([g]) => g === groupOf(item.at))![1].push(item);
  }

  return (
    <div className="px-8 py-7">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <button
          onClick={markAllRead}
          className="rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
        >
          Mark all as read
        </button>
      </div>

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          Nothing yet — notifications appear as calls are analyzed and risks fire.
        </p>
      )}

      {groups.map(([label, group]) =>
        group.length === 0 ? null : (
          <section key={label} className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {label}
            </p>
            <div className="mt-2 space-y-2">
              {group.map((item) => {
                const unread = !read.has(item.id);
                const icon = ICON[item.kind];
                const inner = (
                  <div
                    className={`flex items-start gap-3.5 rounded-xl border px-5 py-4 ${
                      unread
                        ? "border-indigo-100 bg-indigo-50/50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${icon.style}`}>
                      {icon.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.title}</span>
                      <span className="mt-0.5 block text-sm text-gray-600">{item.body}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-gray-400">
                      {ago(item.at)}
                      {unread && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                    </span>
                  </div>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div key={item.id}>{inner}</div>
                );
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
