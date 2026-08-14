"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DealNotesView } from "@/components/DealNotesView";
import { DealSignalsView } from "@/components/DealSignalsView";
import { MethodologyScorecardView } from "@/components/MethodologyScorecardView";
import type { DealSignalFeed } from "@/lib/deal-signals";
import type { MethodologyScorecard } from "@/lib/methodology";
import type { RunRecord } from "@/lib/types";

export type RunTab = "notes" | "scorecard" | "signals";

export function RunWorkspace({
  run,
  initialTab,
  initialCard,
  signalFeed,
  llmAvailable,
  packs,
}: {
  run: RunRecord;
  initialTab: RunTab;
  initialCard: MethodologyScorecard | null;
  signalFeed: DealSignalFeed | null;
  llmAvailable: boolean;
  packs: Array<{ id: string; name: string }>;
}) {
  const [tab, setTab] = useState<RunTab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  function selectTab(next: RunTab) {
    setTab(next);
    const href = next === "notes" ? pathname : `${pathname}?tab=${next}`;
    router.replace(href, { scroll: false });
  }

  function tabClass(name: RunTab) {
    return `border-b-2 px-4 py-3 text-sm tracking-wide transition ${
      tab === name
        ? "border-signal text-paper"
        : "border-transparent text-mist hover:text-paper"
    }`;
  }

  const hotCount = signalFeed
    ? signalFeed.alerts.filter((a) => a.severity === "hot").length
    : 0;

  return (
    <div>
      <div className="border-b border-white/10 px-5 md:px-8">
        <div className="mx-auto flex max-w-7xl gap-1">
          <button type="button" className={tabClass("notes")} onClick={() => selectTab("notes")}>
            Notes
          </button>
          <button
            type="button"
            className={tabClass("scorecard")}
            onClick={() => selectTab("scorecard")}
          >
            Scorecard
            {initialCard ? ` · ${initialCard.pack.name} ${initialCard.score}` : ""}
          </button>
          <button
            type="button"
            className={tabClass("signals")}
            onClick={() => selectTab("signals")}
          >
            Signals
            {signalFeed ? ` · ${signalFeed.alerts.length}${hotCount ? ` (${hotCount} hot)` : ""}` : ""}
          </button>
        </div>
      </div>
      {tab === "notes" ? (
        <DealNotesView run={run} />
      ) : tab === "scorecard" ? (
        <MethodologyScorecardView
          run={run}
          initialCard={initialCard}
          llmAvailable={llmAvailable}
          packs={packs}
        />
      ) : (
        <DealSignalsView feed={signalFeed} />
      )}
    </div>
  );
}
