"use client";

// The electron app shell — light-theme sidebar layout from the design spec.
// Scoped styling: everything under the (electron) route group renders inside
// this wrapper, independent of the dark receipts UI which stays untouched.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const I = {
  upload: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><path d="M12 3H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V7L12 3Z"/><path d="M12 3v4h4"/></svg>
  ),
  recordings: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><path d="M4 12v-2a6 6 0 0 1 12 0v2"/><rect x="2.5" y="12" width="4" height="5" rx="1.5"/><rect x="13.5" y="12" width="4" height="5" rx="1.5"/></svg>
  ),
  companies: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><rect x="4" y="3.5" width="9" height="13" rx="1"/><path d="M13 8h3v8.5H4"/><path d="M7 7h1.5M7 10h1.5M7 13h1.5"/></svg>
  ),
  reps: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><circle cx="7.5" cy="7" r="2.5"/><path d="M3 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><circle cx="14" cy="7.5" r="2"/><path d="M13.5 12.2c2 .2 3.5 1.5 3.5 3.8"/></svg>
  ),
  templates: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/><path d="M3.5 8h13M8 8v8.5"/></svg>
  ),
  bell: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><path d="M10 3.5a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5-1.5 5h12s-1.5-1-1.5-5A4.5 4.5 0 0 0 10 3.5Z"/><path d="M8.5 15.5a1.6 1.6 0 0 0 3 0"/></svg>
  ),
  help: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><circle cx="10" cy="10" r="7"/><path d="M7.8 7.7a2.2 2.2 0 0 1 4.3.7c0 1.4-2.1 1.7-2.1 2.9"/><circle cx="10" cy="14" r="0.4" fill="currentColor"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]"><circle cx="10" cy="10" r="2.5"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4"/></svg>
  ),
};

function NavItem({
  href,
  icon,
  label,
  badge,
  chevron,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  chevron?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
        active
          ? "bg-white font-medium text-gray-900 shadow-sm ring-1 ring-gray-200"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <span className={active ? "text-indigo-600" : "text-gray-400"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
      {chevron && (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3 text-gray-400"><path d="M3 4.5 6 7.5 9 4.5"/></svg>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </p>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setUnread(Math.min(9, (d.notifications ?? []).filter((n: { kind: string }) => n.kind === "risk" || n.kind === "coaching").length)))
      .catch(() => null);
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setUser(d.user && d.user !== "open" ? d.user : null))
      .catch(() => null);
    const t = setTimeout(() => {
      try {
        const profile = JSON.parse(localStorage.getItem("electron.profile") ?? "{}");
        if (profile.firstName) {
          setUser(`${profile.firstName} ${profile.lastName ?? ""}`.trim());
        }
      } catch {
        // ignore bad local profile
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const displayUser = user || "My Workspace";
  const initials = displayUser
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-[#f7f8fa] text-gray-900 antialiased">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-gray-200 bg-[#fafbfc] px-3 py-4">
        <div className="flex items-center gap-2 px-3">
          <span className="inline-block h-6 w-6 rounded-full bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-400" />
          <span className="text-[17px] font-semibold tracking-tight">electron</span>
        </div>

        <nav className="mt-2 flex-1">
          <SectionLabel>Getting started</SectionLabel>
          <NavItem href="/upload" icon={I.upload} label="Upload" />
          <SectionLabel>Coaching</SectionLabel>
          <NavItem href="/recordings" icon={I.recordings} label="Recordings" />
          <NavItem href="/companies" icon={I.companies} label="Companies" chevron />
          <NavItem href="/reps" icon={I.reps} label="Reps" chevron />
          <SectionLabel>Resources</SectionLabel>
          <NavItem href="/templates" icon={I.templates} label="Templates" chevron />
        </nav>

        <div className="space-y-0.5">
          <NavItem href="/notifications" icon={I.bell} label="Notifications" badge={unread} />
          <NavItem href="/help" icon={I.help} label="Help" />
          <NavItem href="/settings" icon={I.settings} label="Settings" />
        </div>

        <Link
          href="/settings"
          className="mt-3 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm hover:bg-gray-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-400 text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{displayUser}</span>
            <span className="block text-xs text-gray-500">My Workspace</span>
          </span>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3 text-gray-400"><path d="M4.5 3 7.5 6 4.5 9"/></svg>
        </Link>
      </aside>

      <main className="ml-60 min-h-screen flex-1">{children}</main>
    </div>
  );
}
