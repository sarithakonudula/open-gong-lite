import type {
  AlertSeverity,
  DealAlert,
  DealSignalFeed,
} from "@/lib/deal-signals";

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

export function DealSignalsView({ feed }: { feed: DealSignalFeed | null }) {
  if (!feed) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
          No signal sources wired for this deal yet
        </h2>
        <p className="mt-3 leading-relaxed text-fog/90">
          Deal signals turn de-anonymized page visits, support tickets, renewal
          windows, and overdue commitments into alerts that cite the exact line
          from the call that makes them matter. Wire a vendor (Factors, RB2B,
          your ticketing tool) to POST /api/signals, or open the Brightsmile 1
          sample run to see the demo feed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <p className="text-sm uppercase tracking-wide text-mist">
        {feed.company} · {feed.alerts.length} alerts
        {feed.suppressed.length > 0 &&
          ` · ${feed.suppressed.length} below the noise floor for this deal size`}
        {feed.mode === "demo" && " · demo data"}
      </p>
      <ul className="mt-4 space-y-4">
        {feed.alerts.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </ul>
    </div>
  );
}
