"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const TABS = ["Profile", "Notifications", "Team", "Billing", "Danger Zone"] as const;
type Tab = (typeof TABS)[number];

type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  timezone: string;
  workspace: string;
};

const EMPTY: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  role: "Account Executive",
  timezone: "Eastern Time (ET)",
  workspace: "My Workspace",
};

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{props.label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-300"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

export function SettingsClient() {
  const [tab, setTab] = useState<Tab>("Profile");
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("electron.profile") ?? "null");
        if (stored) setProfile({ ...EMPTY, ...stored });
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function save() {
    localStorage.setItem("electron.profile", JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const set = (key: keyof Profile) => (value: string) =>
    setProfile((p) => ({ ...p, [key]: value }));

  const initials =
    `${profile.firstName[0] ?? "M"}${profile.lastName[0] ?? "W"}`.toUpperCase();

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[200px_1fr]">
        <div className="space-y-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`block w-full rounded-lg px-4 py-2 text-left text-sm ${
                tab === t
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="max-w-2xl">
          {tab === "Profile" && (
            <>
              <h2 className="text-xl font-bold">Profile</h2>
              <p className="mt-1 text-sm text-gray-500">
                Update your personal information and how you appear to your team.
              </p>
              <div className="mt-5 flex items-center gap-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-orange-400 text-lg font-bold text-white">
                  {initials}
                </span>
                <span className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-400">
                  Change photo
                </span>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="First name" value={profile.firstName} onChange={set("firstName")} />
                <Field label="Last name" value={profile.lastName} onChange={set("lastName")} />
                <Field label="Email" value={profile.email} onChange={set("email")} />
                <Field label="Role" value={profile.role} onChange={set("role")} />
                <Field label="Timezone" value={profile.timezone} onChange={set("timezone")} />
                <Field label="Workspace" value={profile.workspace} onChange={set("workspace")} />
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={save}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {saved ? "Saved ✓" : "Save changes"}
                </button>
                <button
                  onClick={() => setProfile(EMPTY)}
                  className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                Profile is stored locally in this browser. Workspace-level
                configuration (LLM chain, HubSpot, Slack, language filter) lives
                in{" "}
                <Link href="/admin" className="text-indigo-500 underline">
                  workspace admin
                </Link>
                .
              </p>
            </>
          )}
          {tab === "Notifications" && (
            <>
              <h2 className="text-xl font-bold">Notifications</h2>
              <p className="mt-1 text-sm text-gray-500">
                Deal-risk alert thresholds and Slack delivery are workspace
                settings — configure them in{" "}
                <Link href="/admin" className="text-indigo-500 underline">
                  workspace admin
                </Link>{" "}
                (Notifications section).
              </p>
            </>
          )}
          {(tab === "Team" || tab === "Billing") && (
            <>
              <h2 className="text-xl font-bold">{tab}</h2>
              <p className="mt-1 text-sm text-gray-500">
                Not part of the self-hosted build — this instance has a single
                workspace. Login access is controlled by OPENGONG_AUTH_* env
                vars on the deployment.
              </p>
            </>
          )}
          {tab === "Danger Zone" && (
            <>
              <h2 className="text-xl font-bold text-red-600">Danger Zone</h2>
              <p className="mt-1 text-sm text-gray-500">
                Run history lives in the server&rsquo;s data directory. Delete
                runs by removing files under <code className="rounded bg-gray-100 px-1">data/runs/</code>{" "}
                on the host — there is deliberately no bulk-delete button in the UI.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
