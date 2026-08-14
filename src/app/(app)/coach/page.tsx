import Link from "next/link";
import { CoachClient } from "@/components/CoachClient";
import { LogoutButton } from "@/components/LogoutButton";
import { isAuthEnabled } from "@/lib/auth";

export const metadata = { title: "Rep coaching — OpenGong Lite" };

export default function CoachPage() {
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
            <Link href="/admin" className="btn-ghost">Admin</Link>
            {showLogout && <LogoutButton />}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Rep training loop
        </h1>
        <p className="mt-2 text-sm text-mist">
          Trait-level trends across every scored call, and drills built from
          the methodology pack&rsquo;s coaching content plus the rep&rsquo;s
          own quoted lines — personalized with receipts, never generic.
        </p>
        <div className="mt-8">
          <CoachClient />
        </div>
      </div>
    </main>
  );
}
