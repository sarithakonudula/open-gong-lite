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
          Models draft. Gates decide what is allowed to look like a fact.
          Unproven claims stay on the page in grey — they never silently ship.
          Injected lines are struck through and barred from the follow-up email.
        </p>

        <ol className="mt-12 space-y-8">
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              1 · Schema gate
            </h2>
            <p className="mt-2 text-mist">
              Bad JSON never becomes deal notes. Zod validates title, summary,
              objections, intent, next steps, pain, pricing, competitors, and
              follow-up email before any UI render.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              2 · Evidence gate (L7 chain)
            </h2>
            <p className="mt-2 text-mist">
              Each claim carries <code className="text-signal">lineId</code> +
              quote. Quotes are checked in order: exact substring → normalized
              match (no digit folding — &quot;forty&quot; ≠ &quot;40&quot;) →
              long unique rescue across the call → else{" "}
              <code className="text-signal">uncorroborated</code>. Demote, don&apos;t
              hide. Fuzzy paraphrase never ships as verified.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              3 · Injection screen
            </h2>
            <p className="mt-2 text-mist">
              A planted line <em>is</em> in the transcript, so receipts alone
              cannot catch it. A separate taint screen quarantines instruction-shaped
              utterances. Best-effort on purpose — the email choke is the
              load-bearing layer.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              4 · Email choke
            </h2>
            <p className="mt-2 text-mist">
              Follow-up drafts are built only from{" "}
              <code className="text-signal">verified</code> /{" "}
              <code className="text-signal">segment_corrected</code> claims.
              Citing an unproven id rejects the whole draft. Unverified claims
              never leave this page.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              5 · Bounded retry + visible status
            </h2>
            <p className="mt-2 text-mist">
              Schema failures and zero-receipt runs retry with the reason
              (capped). Coverage decides{" "}
              <code className="text-signal">shipped</code> /{" "}
              <code className="text-signal">partial</code> /{" "}
              <code className="text-signal">failed</code>. The header shows %
              verified — honesty is the product.
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
  → injection screen + L7 receipts
  → email choke
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
