import Link from "next/link";
import { DigestClient } from "@/components/DigestClient";
import { LogoutButton } from "@/components/LogoutButton";
import { isAuthEnabled } from "@/lib/auth";

export const metadata = { title: "Management digest — OpenGong Lite" };

export default function DigestPage() {
  const showLogout = isAuthEnabled();
  return (
    <main className="min-h-screen">
      <div className="border-b border-white/10 px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link href="/" className="font-[family-name:var(--font-display)] text-lg tracking-tight">
            OpenGong Lite
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/coach" className="btn-ghost">Coach</Link>
            <Link href="/admin" className="btn-ghost">Admin</Link>
            {showLogout && <LogoutButton />}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Management digest
        </h1>
        <p className="mt-2 text-sm text-mist">
          The pipeline story for a sales leader — momentum, risks, and next
          steps per deal, built only from gate-passed claims. One click sends
          it to Slack.
        </p>
        <div className="mt-8">
          <DigestClient />
        </div>
      </div>
    </main>
  );
}
