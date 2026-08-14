"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminSettingsClient } from "@/components/AdminSettingsClient";

export type SettingsTab =
  | "profile"
  | "notifications"
  | "integrations"
  | "team"
  | "billing"
  | "danger";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "team", label: "Team" },
  { id: "billing", label: "Billing" },
  { id: "danger", label: "Danger Zone" },
];

type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  timezone: string;
  workspace: string;
};

const EMPTY_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  role: "Account Executive",
  timezone: "Eastern Time (ET)",
  workspace: "My Workspace",
};

const TIMEZONES = [
  "Eastern Time (ET)",
  "Central Time (CT)",
  "Mountain Time (MT)",
  "Pacific Time (PT)",
  "India Standard Time (IST)",
  "Central European Time (CET)",
  "Greenwich Mean Time (GMT)",
];

type NotifyPrefs = {
  weeklyDigest: boolean;
  atRiskAlerts: boolean;
  recordingProcessed: boolean;
};

const DEFAULT_PREFS: NotifyPrefs = {
  weeklyDigest: true,
  atRiskAlerts: true,
  recordingProcessed: true,
};

// Sample teammates — there are no user accounts yet; the workspace is a
// single shared login.
const TEAM_FIXTURE = [
  { name: "Saritha Konudula", role: "Owner" },
  { name: "Sourav Mohanty", role: "Marketing" },
  { name: "Demo User", role: "Account Executive" },
];

function initialsOf(text: string): string {
  return (
    text
      .split(/[\s._@-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "OG"
  );
}

function SampleChip({ label = "Sample" }: { label?: string }) {
  return <span className="chip chip-muted">{label}</span>;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? "bg-brand" : "bg-edge-strong"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function ProfileTab() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [photoNote, setPhotoNote] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let stored: Profile | null = null;
    try {
      const raw = window.localStorage.getItem("og-profile");
      if (raw) stored = { ...EMPTY_PROFILE, ...JSON.parse(raw) };
    } catch {
      stored = null;
    }
    if (stored) {
      const next = stored;
      void Promise.resolve().then(() => setProfile(next));
      return;
    }
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d: { user?: string | null }) => {
        if (!d.user) return;
        setProfile((p) => ({
          ...p,
          email: d.user!.includes("@") ? d.user! : p.email,
          firstName: p.firstName || d.user!.split(/[@._-]/)[0] || "",
        }));
      })
      .catch(() => undefined);
  }, []);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function save() {
    try {
      window.localStorage.setItem("og-profile", JSON.stringify(profile));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch {
      setSaved(false);
    }
  }

  const displayName =
    `${profile.firstName} ${profile.lastName}`.trim() || profile.email;

  return (
    <div>
      <h2 className="text-xl font-semibold text-fg">Profile</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Update your personal information and how you appear to your team.
      </p>

      <div className="mt-6 flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-warn-soft text-lg font-bold text-warn">
          {initialsOf(displayName)}
        </span>
        <button
          type="button"
          className="btn-ghost !py-2 text-sm"
          onClick={() => setPhotoNote(true)}
        >
          Change photo
        </button>
        {photoNote && <SampleChip label="Sample — stored locally" />}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-fg-muted">
          First name
          <input
            className="field mt-1.5"
            value={profile.firstName}
            onChange={(e) => set("firstName", e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-fg-muted">
          Last name
          <input
            className="field mt-1.5"
            value={profile.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-fg-muted">
          Email
          <input
            className="field mt-1.5"
            type="email"
            value={profile.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-fg-muted">
          Role
          <input
            className="field mt-1.5"
            value={profile.role}
            onChange={(e) => set("role", e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-fg-muted">
          Timezone
          <select
            className="field mt-1.5"
            value={profile.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-fg-muted">
          Workspace
          <input
            className="field mt-1.5"
            value={profile.workspace}
            onChange={(e) => set("workspace", e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" className="btn-primary text-sm" onClick={save}>
          {saved ? "Saved" : "Save changes"}
        </button>
        <SampleChip label="Stored locally — sample" />
      </div>
    </div>
  );
}

function NotificationsTab({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("og-notify-prefs");
      if (raw) {
        const next = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
        void Promise.resolve().then(() => setPrefs(next));
      }
    } catch {
      // keep defaults
    }
  }, []);

  function set(key: keyof NotifyPrefs, value: boolean) {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        window.localStorage.setItem("og-notify-prefs", JSON.stringify(next));
      } catch {
        // best effort
      }
      return next;
    });
  }

  const rows: Array<{ key: keyof NotifyPrefs; title: string; blurb: string }> = [
    {
      key: "weeklyDigest",
      title: "Weekly coaching digest",
      blurb: "A summary of rep score trends and new drills.",
    },
    {
      key: "atRiskAlerts",
      title: "At-risk deal alerts",
      blurb: "When a company's momentum drops into at-risk.",
    },
    {
      key: "recordingProcessed",
      title: "Recording processed",
      blurb: "When an uploaded call finishes analysis and scoring.",
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-fg">Notifications</h2>
      <p className="mt-1 text-sm text-fg-muted">
        In-app notification preferences.
      </p>
      <div className="card mt-6 divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                {row.title} <SampleChip />
              </p>
              <p className="text-[13px] text-fg-muted">{row.blurb}</p>
            </div>
            <Toggle
              checked={prefs[row.key]}
              onChange={(v) => set(row.key, v)}
              label={row.title}
            />
          </div>
        ))}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
              Slack risk alerts <span className="chip chip-positive">Live</span>
            </p>
            <p className="text-[13px] text-fg-muted">
              Configured in{" "}
              <button
                type="button"
                className="receipt-link"
                onClick={onOpenIntegrations}
              >
                Integrations
              </button>{" "}
              → Slack webhook + risk floor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamTab() {
  const [inviteNote, setInviteNote] = useState(false);
  return (
    <div>
      <h2 className="text-xl font-semibold text-fg">Team</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Auth is a single shared login today — there are no per-user accounts
        yet, so this roster is a sample of what the team view will hold.
      </p>
      <div className="card mt-6 divide-y divide-[var(--border)]">
        {TEAM_FIXTURE.map((member) => (
          <div key={member.name} className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand">
              {initialsOf(member.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-fg">{member.name}</p>
              <p className="text-[13px] text-fg-muted">{member.role}</p>
            </div>
            <SampleChip />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="btn-primary text-sm opacity-60"
          onClick={() => setInviteNote(true)}
        >
          Invite teammate
        </button>
        {inviteNote && (
          <SampleChip label="Sample — no user accounts yet; the workspace is single-login" />
        )}
      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-fg">Billing</h2>
      <div className="card mt-6 p-6">
        <p className="text-lg font-semibold text-fg">
          Free &amp; self-hosted · MIT license
        </p>
        <p className="mt-2 max-w-lg text-sm text-fg-muted">
          There is nothing to bill. You bring your own PyAI key for
          transcription (a sandbox key is minted automatically) and,
          optionally, your own LLM key for extraction and scoring — costs live
          with those providers, not here.
        </p>
        <a
          href="https://github.com/sarithakonudula/open-gong-lite"
          target="_blank"
          rel="noreferrer"
          className="btn-ghost mt-4 text-sm"
        >
          View the source on GitHub
        </a>
      </div>
    </div>
  );
}

function DangerTab() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-fg">Danger Zone</h2>
      <div className="mt-6 rounded-xl border border-danger/40 bg-danger-soft/40 p-6">
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-ghost text-sm" disabled>
            Delete all recordings
          </button>
          <button type="button" className="btn-ghost text-sm" disabled>
            Reset workspace
          </button>
        </div>
        <p className="mt-3 text-[13px] text-fg-muted">
          Disabled in this build — data lives in <code>data/</code> on your
          volume; delete it from the host if you really mean it.
        </p>
      </div>
    </div>
  );
}

export function SettingsClient({
  initialTab,
  authEnabled,
}: {
  initialTab: SettingsTab;
  authEnabled: boolean;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const router = useRouter();

  function selectTab(next: SettingsTab) {
    setTab(next);
    router.replace(
      next === "profile" ? "/settings" : `/settings?tab=${next}`,
      { scroll: false },
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Settings</h1>

      <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`rounded-lg px-3.5 py-2 text-left text-sm font-medium transition ${
                tab === t.id
                  ? "bg-brand-soft text-brand"
                  : "text-fg-muted hover:bg-canvas hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === "profile" ? (
            <ProfileTab />
          ) : tab === "notifications" ? (
            <NotificationsTab
              onOpenIntegrations={() => selectTab("integrations")}
            />
          ) : tab === "integrations" ? (
            <div>
              <h2 className="text-xl font-semibold text-fg">Integrations</h2>
              <p className="mt-1 text-sm text-fg-muted">
                LLM provider chain, HubSpot, and Slack — live workspace
                configuration.
              </p>
              {!authEnabled && (
                <p className="mt-3 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn">
                  This page is open because no login is configured. Set
                  OPENGONG_AUTH_PASSWORD before storing real keys on a shared
                  deployment.
                </p>
              )}
              <div className="legacy-dark mt-4 rounded-2xl p-4">
                <AdminSettingsClient />
              </div>
            </div>
          ) : tab === "team" ? (
            <TeamTab />
          ) : tab === "billing" ? (
            <BillingTab />
          ) : (
            <DangerTab />
          )}
        </div>
      </div>

      <p className="mt-10 text-[12px] text-fg-soft">
        Looking for the old admin console?{" "}
        <Link href="/settings?tab=integrations" className="receipt-link">
          It lives here now
        </Link>
        .
      </p>
    </div>
  );
}
