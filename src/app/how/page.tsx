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
          How the checking works
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-fog/90">
          The AI writes the notes. It also has to name the exact sentence in
          the call each note came from. The app then goes looking for that
          sentence itself. The AI never gets to confirm its own work. A note
          whose sentence is missing is neither deleted nor allowed to stand as
          a fact. It stays on the page, marked{" "}
          <strong>not found in the call</strong>, and it never enters the
          follow-up email.
        </p>

        <h2 className="mt-14 font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Every note ends up as one of four things
        </h2>
        <ul className="mt-6 space-y-5">
          <li>
            <p className="text-paper">
              <span className="text-signal">✓ Backed.</span> The sentence is
              there, word for word. Click the note and the call scrolls to it.
              This is the normal case.
            </p>
          </li>
          <li>
            <p className="text-paper">
              <span className="text-signal">✓ Backed, citation corrected.</span>{" "}
              The AI pointed at the wrong sentence. The checker found the real
              one somewhere else in the call and says so on the note, because a
              silent correction is still a correction you were not told about.
            </p>
          </li>
          <li>
            <p className="text-paper">
              <span className="text-heat">⚠ Not found in the call.</span> The
              quote the AI offered is nowhere in the recording. The note stays
              on the page, greyed out and labeled. Most tools would have sent
              this line to your CRM.
            </p>
          </li>
          <li>
            <p className="text-paper">
              <span className="text-heat">⛔ Blocked.</span> The note stands on
              a moment where someone spoke an instruction to the AI, such as a
              phishing email read out loud. It is struck through and barred
              from notes and email. When a call talks to your AI, that is an
              attack on your notes, and an attack never counts as a source.
            </p>
          </li>
        </ul>
        <p className="mt-5 text-sm text-mist">
          Developers: in the code and the JSON these four are{" "}
          <code className="text-signal">verified</code>,{" "}
          <code className="text-signal">segment_corrected</code>,{" "}
          <code className="text-signal">uncorroborated</code>, and{" "}
          <code className="text-signal">blocked_injection</code>.
        </p>

        <h2 className="mt-14 font-[family-name:var(--font-display)] text-3xl tracking-tight">
          The five checks, in order
        </h2>
        <ol className="mt-6 space-y-8">
          <li>
            <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              1 · The shape of the answer
            </h3>
            <p className="mt-2 text-mist">
              The AI has to hand back a specific shape: a title, a summary,
              objections, intent, next steps, pain, pricing, competitors, and
              an email, each note with a quote attached. Anything else is
              rejected before it can reach the page.
            </p>
          </li>
          <li>
            <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              2 · Looking for the quote
            </h3>
            <p className="mt-2 text-mist">
              The checker looks four ways, in order: exactly as written, then
              ignoring case and punctuation, then anywhere in the call if the
              quote is long and appears only once, and otherwise the note is
              marked not found. Three rules it never bends. Digits and number
              words are never treated as equal, so &quot;forty&quot; is not
              &quot;40&quot;, and a time like &quot;3:30&quot; can never
              collapse into &quot;330&quot;. A quote that is empty, all
              punctuation, or too short to mean anything on its own is never
              accepted as backing. And when a quote could match two different
              places, the checker refuses to guess.
            </p>
          </li>
          <li>
            <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              3 · Watching for instructions aimed at the AI
            </h3>
            <p className="mt-2 text-mist">
              A planted line really is in the recording, so a citation alone
              proves nothing about it. A separate screen looks for sentences
              shaped like orders to the AI and blocks anything standing on
              them. It is pattern matching and it is best effort. Novel
              phrasings will get past it, which is why the email step below
              exists.
            </p>
          </li>
          <li>
            <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              4 · The email is assembled here
            </h3>
            <p className="mt-2 text-mist">
              The follow-up email is put together from backed notes only. It
              never sees the transcript, so nothing can ride into it from the
              call. A draft that cites anything else is thrown out whole. There
              is no trimming step where an unbacked line could survive.
            </p>
          </li>
          <li>
            <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              5 · The score is on the page
            </h3>
            <p className="mt-2 text-mist">
              If the AI comes back with the wrong shape, or with nothing the
              checker can back, it gets asked again with the reason, a capped
              number of times. What survives is printed at the top of the notes
              as a fraction, such as 10 of 11 backed, never as a percentage on
              its own.
            </p>
          </li>
          <li>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              6 · Methodology scorecard
            </h2>
            <p className="mt-2 text-mist">
              A second tab on the run page scores the call against MEDDIC (or
              another pack) on a 0–3 depth rubric. Evidence still runs the L7
              gate. Deal-band rigor keeps champion-building off the denominator
              on a mid-market deal instead of punishing a short discovery.
              Brightsmile 1 ships a stored verdict with no LLM keys; live scoring
              is opt-in.
            </p>
          </li>
        </ol>

        <section className="mt-14 space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            Why this is not a prompt
          </h2>
          <p className="text-mist">
            A prompt can ask for a citation. Only code can refuse to render one
            that isn&apos;t true. Recap summaries have no segment pointers —
            we still require a quote the transcript can re-find, or the claim
            stays grey.
          </p>
          <ul className="space-y-3 text-mist">
            <li>
              Hyprnote&apos;s summary path never receives a line id — citation
              is architecturally impossible there.
            </li>
            <li>
              Meetily&apos;s open-source edition paywalls diarization; the
              audio behind a summary is not replayable from the notes.
            </li>
            <li>
              Gong&apos;s call brief does not carry claim-level receipts. Ours
              does, in git-clone form.
            </li>
          </ul>
        </section>

        <section className="mt-14 rounded-[1.4rem] border border-white/10 bg-ink-soft/55 p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            What happens to your audio
          </h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-[family-name:var(--font-mono)] text-sm leading-relaxed text-fog/90">{`your recording
  → transcribed into lines with speakers
  → read into notes, each with a quote
  → instruction screen + the quote check
  → email built from backed notes only
  → the page you are reading
  → scorecard and signals, if you open them`}</pre>
          <p className="mt-4 text-sm text-mist">
            Every outbound network call this app can make is listed in{" "}
            <code className="text-signal">DATA-FLOW.md</code>.
          </p>
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
