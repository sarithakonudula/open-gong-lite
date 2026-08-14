import Link from "next/link";
import { loadSample } from "@/lib/samples";
import {
  demoDealSignalFeed,
  type AlertSeverity,
  type DealAlert,
} from "@/lib/deal-signals";
import { SIGNAL_EVIDENCE_LABEL, SIGNAL_SEVERITY_LABEL } from "@/lib/labels";

export const dynamic = "force-static";

const SEVERITY_STYLE: Record<AlertSeverity, { label: string; badge: string }> = {
  hot: { label: SIGNAL_SEVERITY_LABEL.hot!, badge: "border-danger/60 text-danger" },
  high: { label: SIGNAL_SEVERITY_LABEL.high!, badge: "border-danger/40 text-danger" },
  watch: { label: SIGNAL_SEVERITY_LABEL.watch!, badge: "border-edge-strong text-fg-muted" },
  info: { label: SIGNAL_SEVERITY_LABEL.info!, badge: "border-edge text-fg-soft" },
};

function AlertCard({ alert }: { alert: DealAlert }) {
  const style = SEVERITY_STYLE[alert.severity];
  return (
    <li className="rounded-xl border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs uppercase tracking-wide ${style.badge}`}
        >
          {style.label}
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          {alert.title}
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{alert.detail}</p>
      {alert.evidenceState === "cited" && alert.context ? (
        <div className="mt-3 space-y-1">
          {alert.context.evidence.map((e) => (
            <blockquote
              key={`${e.lineId}:${e.quote.slice(0, 16)}`}
              className="border-l-2 border-brand/50 pl-3 text-sm italic text-fg-soft"
            >
              “{e.quote}” <span className="not-italic text-xs">[{e.lineId}]</span>
            </blockquote>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs uppercase tracking-wide text-fg-soft">
          {SIGNAL_EVIDENCE_LABEL.signal_only}
        </p>
      )}
      <p className="mt-3 text-sm text-fg-muted">
        <span className="font-medium text-foreground">What to do:</span>{" "}
        {alert.play}
      </p>
      {alert.resolvesWhen && (
        <p className="mt-2 text-xs text-fg-soft">{alert.resolvesWhen}</p>
      )}
      {alert.push && (
        <p className="mt-2 text-xs uppercase tracking-wide text-brand">
          → sent to the CRM as a task
        </p>
      )}
    </li>
  );
}

export default async function SignalsPage() {
  const sample = await loadSample("brightsmile-01-discovery");
  const feed = sample ? demoDealSignalFeed(sample.transcript) : null;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-atmosphere" />
      <div className="signal-bar absolute left-0 right-0 top-0 h-px" />

      <div className="relative mx-auto w-full max-w-4xl px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-soft">
              Coaching
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">
              Deal signals
            </h1>
          </div>
          <Link href="/how" className="btn-ghost">
            How it works
          </Link>
        </div>

        <p className="mt-5 text-lg leading-relaxed text-fg-muted">
          Page visits, support tickets, renewal dates, and promises nobody
          kept, turned into things worth doing today. Each one carries the line
          from the call that makes it matter, or says plainly that no line
          backs it. Sample data: the Brightsmile deal, one week after the first
          call.
        </p>

        {feed ? (
          <>
            <p className="mt-8 text-sm uppercase tracking-wide text-fg-soft">
              {feed.company} · {feed.alerts.length}{" "}
              {feed.alerts.length === 1 ? "signal" : "signals"}
              {feed.suppressed.length > 0 &&
                ` · ${feed.suppressed.length} too small to raise on a deal this size`}
            </p>
            <ul className="mt-4 space-y-4">
              {feed.alerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-8 text-fg-soft">Demo sample unavailable.</p>
        )}
      </div>
    </main>
  );
}
