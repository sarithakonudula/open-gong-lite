import type {
  AlertSeverity,
  DealAlert,
  DealSignalFeed,
} from "@/lib/deal-signals";
import { SIGNAL_EVIDENCE_LABEL, SIGNAL_SEVERITY_LABEL } from "@/lib/labels";

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

export function DealSignalsView({ feed }: { feed: DealSignalFeed | null }) {
  if (!feed) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
          No signal sources wired for this deal yet
        </h2>
        <p className="mt-3 leading-relaxed text-fg-muted">
          Signals turn page visits, support tickets, renewal dates, and
          promises nobody kept into things worth doing today, each carrying the
          line from the call that makes it matter. Point a vendor (Factors,
          RB2B, your ticketing tool) at POST /api/signals, or open the
          Brightsmile 1 sample run to see it with sample data.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <p className="text-sm uppercase tracking-wide text-fg-soft">
        {feed.company} · {feed.alerts.length}{" "}
        {feed.alerts.length === 1 ? "signal" : "signals"}
        {feed.suppressed.length > 0 &&
          ` · ${feed.suppressed.length} too small to raise on a deal this size`}
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
