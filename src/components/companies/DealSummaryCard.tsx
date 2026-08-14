"use client";

// The deal's story across every call in the cluster. Lazy: the Companies page
// renders instantly and each card fetches its own summary, so a cache miss
// (one LLM round trip) only costs the company being looked at. Receipts
// follow the display contract — a timestamp and the call, never line ids.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateShort } from "@/lib/format";
import { sourceLine } from "@/lib/labels";
import type { DealSummary, DealSummaryItem } from "@/lib/deal-summary";

type FetchState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; summary: DealSummary };

function ReceiptChips({
  item,
  receipts,
}: {
  item: DealSummaryItem;
  receipts: DealSummary["receipts"];
}) {
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {item.refs.map((ref) => {
        const receipt = receipts[ref];
        if (!receipt) return null;
        return (
          <Link
            key={ref}
            href={`/runs/${receipt.runId}`}
            title={receipt.quote}
            className="chip chip-muted text-[11px]"
          >
            {formatDateShort(receipt.callDate)} · {sourceLine(receipt.timeLabel)}
          </Link>
        );
      })}
    </span>
  );
}

function ItemGroup({
  heading,
  items,
  receipts,
}: {
  heading: string;
  items: DealSummaryItem[];
  receipts: DealSummary["receipts"];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
        {heading}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-fg">
            {item.text}
            <ReceiptChips item={item} receipts={receipts} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DealSummaryCard({ companyKey }: { companyKey: string }) {
  const [state, setState] = useState<FetchState>({ phase: "loading" });
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/companies/summary?company=${encodeURIComponent(companyKey)}`,
      );
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { summary: DealSummary };
      setState({ phase: "ready", summary: data.summary });
    } catch {
      setState({ phase: "error" });
    }
  }, [companyKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function regenerate() {
    setRegenerating(true);
    try {
      const response = await fetch("/api/companies/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: companyKey }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { summary: DealSummary };
      setState({ phase: "ready", summary: data.summary });
    } catch {
      // keep whatever was on screen
    } finally {
      setRegenerating(false);
    }
  }

  if (state.phase === "loading") {
    return (
      <div className="mt-4 border-t border-edge pt-4">
        <p className="text-sm text-fg-muted">Reading the deal’s calls…</p>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="mt-4 border-t border-edge pt-4">
        <p className="text-sm text-fg-muted">
          The deal summary didn’t load.{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      </div>
    );
  }

  const { summary } = state;
  return (
    <div className="mt-4 border-t border-edge pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-soft">
          Deal summary · all {summary.callCount} call
          {summary.callCount === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <span className="chip chip-muted text-[11px]">
            {summary.generator === "llm"
              ? `AI narrative${summary.provider ? ` · ${summary.provider}` : ""}`
              : "Rule-based summary — connect a model on /admin for the full narrative"}
          </span>
          <button
            type="button"
            className="text-[12px] text-fg-muted underline disabled:opacity-50"
            onClick={() => void regenerate()}
            disabled={regenerating}
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm font-medium text-fg">{summary.headline}</p>

      {summary.narrative.length > 0 && (
        <div className="mt-2 space-y-2">
          {summary.narrative.map((item, i) => (
            <p key={i} className="text-sm text-fg-muted">
              {item.text}
              <ReceiptChips item={item} receipts={summary.receipts} />
            </p>
          ))}
        </div>
      )}

      <ItemGroup heading="Open" items={summary.open} receipts={summary.receipts} />
      <ItemGroup heading="Risks" items={summary.risks} receipts={summary.receipts} />
      <ItemGroup
        heading="Resolved across calls"
        items={summary.resolved}
        receipts={summary.receipts}
      />
    </div>
  );
}
