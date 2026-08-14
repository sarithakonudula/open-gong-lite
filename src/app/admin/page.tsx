import Link from "next/link";
import { AdminSettingsClient } from "@/components/AdminSettingsClient";
import { LogoutButton } from "@/components/LogoutButton";
import { isAuthEnabled } from "@/lib/auth";

export const metadata = { title: "Admin — OpenGong Lite" };

export default function AdminPage() {
  const showLogout = isAuthEnabled();
  return (
    <main className="min-h-screen">
      <div className="border-b border-white/10 px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link href="/" className="font-[family-name:var(--font-display)] text-lg tracking-tight">
            OpenGong Lite
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/digest" className="btn-ghost">Digest</Link>
            <Link href="/coach" className="btn-ghost">Coach</Link>
            {showLogout && <LogoutButton />}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Admin settings
        </h1>
        <p className="mt-2 text-sm text-mist">
          LLM, HubSpot, and notification wiring — stored server-side in
          data/settings.json, applied live. Secrets never reach the browser
          unmasked.
        </p>
        {!showLogout && (
          <p className="mt-2 rounded-lg border border-heat/40 bg-heat/5 px-3 py-2 text-xs text-heat/90">
            This page is open because no login is configured. Set
            OPENGONG_AUTH_PASSWORD before storing real keys on a shared
            deployment.
          </p>
        )}
        <div className="mt-8">
          <AdminSettingsClient />
        </div>
      </div>
    </main>
  );
}
