"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { ElectronLogo } from "@/components/shell/ElectronLogo";
import { OPEN_SEARCH_EVENT } from "@/components/shell/GlobalSearch";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const ICON_CLASS = "h-[18px] w-[18px] shrink-0";

function icon(path: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
      aria-hidden
    >
      {path}
    </svg>
  );
}

const GETTING_STARTED: NavItem[] = [
  {
    href: "/",
    label: "Upload",
    icon: icon(
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 20h16" />
      </>,
    ),
  },
];

const COACHING: NavItem[] = [
  {
    href: "/recordings",
    label: "Recordings",
    icon: icon(
      <>
        <path d="M3 11v2" />
        <path d="M7 8v8" />
        <path d="M11 5v14" />
        <path d="M15 8v8" />
        <path d="M19 11v2" />
      </>,
    ),
  },
  {
    href: "/companies",
    label: "Companies",
    icon: icon(
      <>
        <rect x="4" y="3" width="10" height="18" rx="1" />
        <path d="M14 9h6v12h-6" />
        <path d="M8 7h2M8 11h2M8 15h2" />
      </>,
    ),
  },
  {
    href: "/reps",
    label: "Reps",
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" />
        <path d="M16 8.5a2.6 2.6 0 1 0 0-5" />
        <path d="M17.2 15.2c1.9.5 3 1.9 3.3 4.8" />
      </>,
    ),
  },
];

const RESOURCES: NavItem[] = [
  {
    href: "/templates",
    label: "Templates",
    icon: icon(
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16" />
        <path d="M9 9v11" />
      </>,
    ),
  },
];

const FOOTER: NavItem[] = [
  {
    href: "/notifications",
    label: "Notifications",
    icon: icon(
      <>
        <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9" />
        <path d="M10 18.7a2.2 2.2 0 0 0 4 0" />
      </>,
    ),
  },
  {
    href: "/help",
    label: "Help",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.6-2.4 2-2.4 3.3" />
        <path d="M12 17h.01" />
      </>,
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
      </>,
    ),
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/recordings") {
    return pathname.startsWith("/recordings") || pathname.startsWith("/runs");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  badge,
}: {
  item: NavItem;
  pathname: string;
  badge?: number;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-surface text-fg shadow-[0_1px_2px_rgba(16,17,20,0.06)] ring-1 ring-edge"
          : "text-fg-muted hover:bg-surface/70 hover:text-fg"
      }`}
    >
      <span className={active ? "text-brand" : "text-fg-soft"}>{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {badge ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

const READ_KEY = "og-notifications-read";

export function AppSidebar() {
  const pathname = usePathname() ?? "/";
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data: { ids?: string[] }) => {
        if (cancelled || !data.ids) return;
        let read: string[] = [];
        try {
          read = JSON.parse(window.localStorage.getItem(READ_KEY) || "[]");
        } catch {
          read = [];
        }
        const readSet = new Set(read);
        setUnread(data.ids.filter((id) => !readSet.has(id)).length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Recompute on route change so marking-as-read clears the dot on nav.
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then(
        (data: {
          authRequired?: boolean;
          authenticated?: boolean;
          user?: string | null;
        }) => {
          if (cancelled) return;
          setAuthRequired(Boolean(data.authRequired));
          setAuthUser(data.user || null);
        },
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = authUser || "Workspace";
  const initials = displayName
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <aside className="flex h-svh w-60 shrink-0 flex-col border-r border-edge bg-sidebar">
      <div className="px-4 pb-2 pt-4">
        <ElectronLogo markClassName="h-7 w-7" textClassName="text-[17px]" />
      </div>

      <div className="px-3 pt-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
          className="flex w-full items-center gap-2.5 rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-fg-muted transition hover:border-edge-strong hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className={ICON_CLASS}
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded-md border border-edge bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fg-soft">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
          Getting started
        </p>
        <div className="space-y-0.5">
          {GETTING_STARTED.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <p className="px-3 pb-1 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
          Coaching
        </p>
        <div className="space-y-0.5">
          {COACHING.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <p className="px-3 pb-1 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
          Resources
        </p>
        <div className="space-y-0.5">
          {RESOURCES.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-edge px-3 py-3">
        {FOOTER.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            badge={item.href === "/notifications" ? unread : undefined}
          />
        ))}
      </div>

      <div className="border-t border-edge px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-surface px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn-soft text-xs font-bold text-warn">
            {initials || "OG"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg">
              {displayName}
            </p>
            <p className="truncate text-[11.5px] text-fg-muted">My Workspace</p>
          </div>
          {authRequired && (
            <LogoutButton className="rounded-md px-1.5 py-1 text-[11px] font-medium text-fg-muted hover:bg-canvas hover:text-fg" />
          )}
        </div>
      </div>
    </aside>
  );
}
