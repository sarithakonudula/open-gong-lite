import { Suspense } from "react";
import { LoginClient } from "@/components/LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-atmosphere" />
      <div className="signal-bar absolute left-0 right-0 top-0 h-px" />

      <section className="relative mx-auto flex min-h-[100svh] w-full max-w-lg flex-col justify-center px-5 py-14 md:px-8">
        <p className="animate-rise text-xs uppercase tracking-[0.28em] text-mist">
          Secure access
        </p>
        <h1 className="animate-rise-delay mt-5 font-[family-name:var(--font-display)] text-[clamp(2.8rem,8vw,4.2rem)] leading-[0.92] tracking-[-0.04em]">
          OpenGong Lite
        </h1>
        <p className="animate-rise-delay-2 mt-4 max-w-md text-base leading-relaxed text-fog/90">
          Sign in to run deal intelligence with receipt gates. Share links stay
          public without a login.
        </p>

        <div className="animate-rise-delay-2">
          <Suspense fallback={<p className="mt-10 text-mist">Loading…</p>}>
            <LoginClient />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
