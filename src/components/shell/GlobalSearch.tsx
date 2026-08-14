"use client";

// Global ⌘K command palette, modeled on the cmdk pattern (Vercel / Linear /
// Raycast style): one overlay that searches pages, recordings (titles,
// transcript lines, shipped notes), companies, and templates. Opens with
// ⌘K / Ctrl+K, the sidebar Search button, or an `og-global-search:open`
// window event.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { formatDateShort } from "@/lib/format";

export const OPEN_SEARCH_EVENT = "og-global-search:open";

type RecordingHit = {
  id: string;
  title: string;
  company: string;
  createdAt: string;
  snippet: string | null;
  matchedIn: "title" | "transcript" | "notes";
};
type CompanyHit = { key: string; name: string; calls: number };
type TemplateHit = { id: string; title: string; short: string };

type ApiResults = {
  recordings: RecordingHit[];
  companies: CompanyHit[];
  templates: TemplateHit[];
};

type Item = {
  key: string;
  group: "Pages" | "Recordings" | "Companies" | "Templates";
  title: string;
  subtitle?: string;
  href: string;
};

const PAGES: Array<{ title: string; href: string; keywords: string }> = [
  { title: "Upload", href: "/", keywords: "upload call audio new home" },
  { title: "Recordings", href: "/recordings", keywords: "recordings meetings calls list" },
  { title: "Companies", href: "/companies", keywords: "companies deals accounts" },
  { title: "Reps", href: "/reps", keywords: "reps team coaching leaderboard" },
  { title: "Templates", href: "/templates", keywords: "templates follow-up email library" },
  { title: "Notifications", href: "/notifications", keywords: "notifications alerts feed" },
  { title: "Help", href: "/help", keywords: "help docs faq support how to" },
  { title: "Settings", href: "/settings", keywords: "settings keys llm hubspot slack config" },
];

const MATCHED_IN_LABEL: Record<RecordingHit["matchedIn"], string> = {
  title: "",
  transcript: "in transcript",
  notes: "in notes",
};

const EMPTY: ApiResults = { recordings: [], companies: [], templates: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiResults>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setActiveIndex(0);
  }, []);

  // Open on ⌘K / Ctrl+K anywhere; also on the sidebar's custom event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced server search over recordings, companies, and templates.
  // Empty-query resets happen in the input's onChange, not here, so the
  // effect body never calls setState synchronously.
  useEffect(() => {
    const q = query.trim();
    if (!open || !q) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      fetch(`/api/search?${new URLSearchParams({ q })}`)
        .then((res) => res.json())
        .then((data: { results?: ApiResults }) => {
          if (cancelled) return;
          setResults(data.results ?? EMPTY);
          setActiveIndex(0);
        })
        .catch(() => {
          if (!cancelled) setResults(EMPTY);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
    if (value.trim()) {
      setBusy(true);
    } else {
      setResults(EMPTY);
      setBusy(false);
    }
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = (
      q
        ? PAGES.filter(
            (p) =>
              p.title.toLowerCase().includes(q) || p.keywords.includes(q),
          )
        : PAGES
    ).map<Item>((p) => ({
      key: `page:${p.href}`,
      group: "Pages",
      title: p.title,
      href: p.href,
    }));

    const recordings = results.recordings.map<Item>((r) => ({
      key: `run:${r.id}`,
      group: "Recordings",
      title: r.title,
      subtitle: [
        r.company,
        formatDateShort(r.createdAt),
        r.snippet
          ? `${MATCHED_IN_LABEL[r.matchedIn]} “${r.snippet}”`.trim()
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/runs/${r.id}`,
    }));

    const companies = results.companies.map<Item>((c) => ({
      key: `company:${c.key}`,
      group: "Companies",
      title: c.name,
      subtitle: `${c.calls} call${c.calls === 1 ? "" : "s"}`,
      href: "/companies",
    }));

    const templates = results.templates.map<Item>((t) => ({
      key: `template:${t.id}`,
      group: "Templates",
      title: t.title,
      subtitle: t.short,
      href: "/templates",
    }));

    return [...recordings, ...companies, ...templates, ...pages];
  }, [query, results]);

  // Clamp instead of resetting in an effect — results shrinking must never
  // leave the highlight pointing past the last row.
  const activeIndexClamped = Math.max(
    0,
    Math.min(activeIndex, items.length - 1),
  );

  const go = useCallback(
    (item: Item) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(activeIndexClamped + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(activeIndexClamped - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndexClamped];
      if (item) go(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndexClamped}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndexClamped]);

  if (!open) return null;

  const groups: Item["group"][] = [
    "Recordings",
    "Companies",
    "Templates",
    "Pages",
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-edge px-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-[18px] w-[18px] shrink-0 text-fg-soft"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            className="w-full bg-transparent py-3.5 text-[15px] text-fg outline-none placeholder:text-fg-soft"
            placeholder="Search recordings, companies, templates, pages…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Search"
          />
          <kbd className="shrink-0 rounded-md border border-edge bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fg-soft">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {busy && (
            <p className="px-3 py-2 text-[13px] text-fg-soft">Searching…</p>
          )}
          {!busy && query.trim() && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-fg-muted">
              No results for &ldquo;{query.trim()}&rdquo;
            </p>
          )}
          {groups.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="pb-1">
                <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
                  {group}
                </p>
                {groupItems.map((item) => {
                  const index = items.indexOf(item);
                  const active = index === activeIndexClamped;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-index={index}
                      onClick={() => go(item)}
                      onMouseMove={() => setActiveIndex(index)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                        active ? "bg-brand-soft" : "hover:bg-canvas"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            active ? "text-brand-deep" : "text-fg"
                          }`}
                        >
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-muted">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                      {active && (
                        <kbd className="mt-0.5 shrink-0 rounded-md border border-edge bg-surface px-1.5 py-0.5 text-[11px] text-fg-soft">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-edge bg-canvas px-4 py-2 text-[11.5px] text-fg-soft">
          <span>
            <kbd className="font-sans">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> open
          </span>
          <span>
            <kbd className="font-sans">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
