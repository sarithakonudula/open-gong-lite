import Link from "next/link";

export const dynamic = "force-static";

export default function HowPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-atmosphere" />
      <div className="signal-bar absolute left-0 right-0 top-0 h-px" />

      <div className="relative mx-auto w-full max-w-3xl px-5 py-12 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            OpenGong Lite
          </Link>
          <Link href="/live" className="btn-ghost">
            Try live call
          </Link>
        </div>

        <h1 className="mt-12 font-[family-name:var(--font-display)] text-[clamp(2.4rem,6vw,3.8rem)] leading-[0.95] tracking-[-0.03em]">
          The harness is the product
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-fog/90">
          Models draft. Gates decide what ships. Every claim in OpenGong Lite
          must point at a real transcript line — or the run fails the gate and
          retries with the exact failure reason.
        </p>

        <ol className="mt-12 space-y-8">
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              1 · Schema gate
            </h2>
            <p className="mt-2 text-mist">
              Bad JSON never becomes deal notes. Zod validates title, summary,
              objections, intent, next steps, and follow-up email before any UI
              render.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              2 · Evidence gate
            </h2>
            <p className="mt-2 text-mist">
              Each claim carries <code className="text-signal">lineId</code> +
              quote. Missing ids or quotes that don&apos;t match the line →{" "}
              <code className="text-signal">unproven_claim</code>. No proof in
              the transcript, no claim in the notes.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              3 · Bounded retry
            </h2>
            <p className="mt-2 text-mist">
              Failed attempts feed gate reasons back into the next try (capped by{" "}
              <code className="text-signal">OPENGONG_MAX_ATTEMPTS</code>). The
              loop never hangs — a deadline governor ends the run.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              4 · Visible status
            </h2>
            <p className="mt-2 text-mist">
              Every run ends <code className="text-signal">shipped</code>,{" "}
              <code className="text-signal">partial</code>, or{" "}
              <code className="text-signal">failed</code>, with attempt history
              on the deal-intelligence page. Judges can see exactly why a claim
              was blocked.
            </p>
          </li>
        </ol>

        <section className="mt-14 rounded-[1.4rem] border border-white/10 bg-ink-soft/55 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            Pipeline
          </h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-[family-name:var(--font-mono)] text-sm leading-relaxed text-fog/90">{`audio / sample / live
  → Hear (jobs or sync)
  → Recap (or LLM / demo extract)
  → gates (schema + receipts)
  → UI / share / export`}</pre>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/#try" className="btn-primary">
            Run a sample →
          </Link>
          <Link href="/live" className="btn-ghost">
            Live call
          </Link>
        </div>
      </div>
    </main>
  );
}
