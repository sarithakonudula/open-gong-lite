import Link from "next/link";
import { loadSample } from "@/lib/samples";
import {
  demoDealSignalFeed,
  type AlertSeverity,
  type DealAlert,
} from "@/lib/deal-signals";

export const dynamic = "force-static";

const SEVERITY_STYLE: Record<AlertSeverity, { label: string; badge: string }> = {
  hot: { label: "Hot", badge: "border-heat/60 text-heat" },
  high: { label: "High", badge: "border-heat/40 text-heat/90" },
  watch: { label: "Watch", badge: "border-mist/50 text-fog" },
  info: { label: "Info", badge: "border-mist/30 text-mist" },
};

function AlertCard({ alert }: { alert: DealAlert }) {
  const style = SEVERITY_STYLE[alert.severity];
  return (
    <li className="rounded-xl border border-mist/25 bg-paper/40 p-5">
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
      <p className="mt-2 text-sm leading-relaxed text-fog/90">{alert.detail}</p>
      {alert.evidenceState === "cited" && alert.context ? (
        <div className="mt-3 space-y-1">
          {alert.context.evidence.map((e) => (
            <blockquote
              key={`${e.lineId}:${e.quote.slice(0, 16)}`}
              className="border-l-2 border-signal/50 pl-3 text-sm italic text-mist"
            >
              “{e.quote}” <span className="not-italic text-xs">[{e.lineId}]</span>
            </blockquote>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs uppercase tracking-wide text-mist">
          no call evidence — signal only
        </p>
      )}
      <p className="mt-3 text-sm text-fog">
        <span className="font-medium text-foreground">Play:</span> {alert.play}
      </p>
      {alert.resolvesWhen && (
        <p className="mt-2 text-xs text-mist">{alert.resolvesWhen}</p>
      )}
      {alert.push && (
        <p className="mt-2 text-xs uppercase tracking-wide text-signal">
          → pushed to CRM as a task
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

      <div className="relative mx-auto w-full max-w-3xl px-5 py-12 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            OpenGong Lite
          </Link>
          <Link href="/how" className="btn-ghost">
            How it works
          </Link>
        </div>

        <h1 className="mt-12 font-[family-name:var(--font-display)] text-[clamp(2.4rem,6vw,3.8rem)] leading-[0.95] tracking-[-0.03em]">
          Deal signals
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-fog/90">
          De-anonymized page visits, support tickets, renewal windows, and
          overdue commitments — turned into alerts that cite the exact line
          from the call that makes them matter. Demo data: the Brightsmile
          deal, one week after discovery.
        </p>

        {feed ? (
          <>
            <p className="mt-8 text-sm uppercase tracking-wide text-mist">
              {feed.company} · {feed.alerts.length} alerts
              {feed.suppressed.length > 0 &&
                ` · ${feed.suppressed.length} below the noise floor for this deal size`}
            </p>
            <ul className="mt-4 space-y-4">
              {feed.alerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-8 text-mist">Demo sample unavailable.</p>
        )}
      </div>
    </main>
  );
}
