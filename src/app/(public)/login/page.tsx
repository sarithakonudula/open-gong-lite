import { Suspense } from "react";
import { LoginClient } from "@/components/LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-edge bg-surface p-7 shadow-[0_16px_50px_rgba(16,17,20,0.08)] md:p-9">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-bold text-white">
            O
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg">
            OpenGong Lite
          </span>
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-fg-soft">
          Secure access
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">
          Sign in to your workspace
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Turn calls into notes that cite the call. Share links stay public
          without a login.
        </p>

        <div>
          <Suspense fallback={<p className="mt-10 text-fg-soft">Loading…</p>}>
            <LoginClient />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
