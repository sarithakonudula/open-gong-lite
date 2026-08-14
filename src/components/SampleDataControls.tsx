"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SAMPLE_DATASET } from "@/lib/sample-dataset-meta";

type Status = {
  loaded: boolean;
  seeded: number;
  total: number;
  companies: number;
};

export function SampleDataControls({
  afterHref = "/recordings",
  compact = false,
}: {
  afterHref?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"load" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sample-data")
      .then((r) => r.json())
      .then((d) =>
        setStatus({
          loaded: Boolean(d.loaded),
          seeded: Number(d.seeded ?? 0),
          total: Number(d.total ?? SAMPLE_DATASET.calls),
          companies: Number(d.companies ?? SAMPLE_DATASET.companies),
        }),
      )
      .catch(() =>
        setStatus({
          loaded: false,
          seeded: 0,
          total: SAMPLE_DATASET.calls,
          companies: SAMPLE_DATASET.companies,
        }),
      );
  }, []);

  async function load() {
    setBusy("load");
    setMessage(
      `Seeding ${SAMPLE_DATASET.calls} calls across ${SAMPLE_DATASET.companies} companies through the gates…`,
    );
    try {
      const res = await fetch("/api/sample-data", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sample data failed");
      setStatus({
        loaded: true,
        seeded: Number(data.total ?? SAMPLE_DATASET.calls),
        total: Number(data.total ?? SAMPLE_DATASET.calls),
        companies: Number(data.companies ?? SAMPLE_DATASET.companies),
      });
      setMessage(null);
      router.push(afterHref);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sample data failed");
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    setMessage("Clearing sample data…");
    try {
      const res = await fetch("/api/sample-data", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clear failed");
      setStatus({
        loaded: false,
        seeded: 0,
        total: SAMPLE_DATASET.calls,
        companies: SAMPLE_DATASET.companies,
      });
      setMessage(`Removed ${data.removed} sample calls.`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(null);
    }
  }

  const loaded = Boolean(status?.loaded);
  const partial =
    loaded && status != null && status.seeded > 0 && status.seeded < status.total;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 ${
        compact ? "" : "mt-8"
      }`}
    >
      <span className="chip chip-warn">Sample data</span>
      <p className="min-w-0 flex-1 text-sm text-fg">
        {loaded
          ? partial
            ? `${status.seeded} of ${status.total} sample calls are loaded — reload to fill in the rest (${SAMPLE_DATASET.sales} sales, ${SAMPLE_DATASET.customerSuccess} customer success, ${SAMPLE_DATASET.support} customer).`
            : `Sample dataset is loaded — ${SAMPLE_DATASET.calls} calls across ${SAMPLE_DATASET.companies} companies (${SAMPLE_DATASET.sales} sales, ${SAMPLE_DATASET.customerSuccess} customer success, ${SAMPLE_DATASET.support} customer).`
          : `Explore with dummy data: ${SAMPLE_DATASET.calls} calls across ${SAMPLE_DATASET.companies} companies — ${SAMPLE_DATASET.sales} sales, ${SAMPLE_DATASET.customerSuccess} customer success, ${SAMPLE_DATASET.support} customer. Every claim still runs through the real evidence gates.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {loaded ? (
          <>
            {partial && (
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                disabled={busy != null || status == null}
                onClick={load}
              >
                {busy === "load" ? "Working…" : "Reload sample data"}
              </button>
            )}
            <button
              type="button"
              className="btn-ghost !py-2 text-sm"
              disabled={busy != null || status == null}
              onClick={clear}
            >
              {busy === "clear" ? "Working…" : "Clear sample data"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary !py-2 text-sm"
            disabled={busy != null || status == null}
            onClick={load}
          >
            {busy === "load" ? "Working…" : "Load sample data"}
          </button>
        )}
      </div>
      {message && (
        <p className="w-full text-[12px] text-fg-muted">{message}</p>
      )}
    </div>
  );
}
