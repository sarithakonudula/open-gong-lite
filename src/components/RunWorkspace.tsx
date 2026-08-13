"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DealNotesView } from "@/components/DealNotesView";
import { MethodologyScorecardView } from "@/components/MethodologyScorecardView";
import type { MethodologyScorecard } from "@/lib/methodology";
import type { RunRecord } from "@/lib/types";

export function RunWorkspace({
  run,
  initialTab,
  initialCard,
  llmAvailable,
  packs,
}: {
  run: RunRecord;
  initialTab: "notes" | "scorecard";
  initialCard: MethodologyScorecard | null;
  llmAvailable: boolean;
  packs: Array<{ id: string; name: string }>;
}) {
  const [tab, setTab] = useState<"notes" | "scorecard">(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  function selectTab(next: "notes" | "scorecard") {
    setTab(next);
    const href = next === "scorecard" ? `${pathname}?tab=scorecard` : pathname;
    router.replace(href, { scroll: false });
  }

  return (
    <div>
      <div className="border-b border-white/10 px-5 md:px-8">
        <div className="mx-auto flex max-w-7xl gap-1">
          <button
            type="button"
            className={`border-b-2 px-4 py-3 text-sm tracking-wide transition ${
              tab === "notes"
                ? "border-signal text-paper"
                : "border-transparent text-mist hover:text-paper"
            }`}
            onClick={() => selectTab("notes")}
          >
            Notes
          </button>
          <button
            type="button"
            className={`border-b-2 px-4 py-3 text-sm tracking-wide transition ${
              tab === "scorecard"
                ? "border-signal text-paper"
                : "border-transparent text-mist hover:text-paper"
            }`}
            onClick={() => selectTab("scorecard")}
          >
            Scorecard
            {initialCard ? ` · ${initialCard.pack.name} ${initialCard.score}` : ""}
          </button>
        </div>
      </div>
      {tab === "notes" ? (
        <DealNotesView run={run} />
      ) : (
        <MethodologyScorecardView
          run={run}
          initialCard={initialCard}
          llmAvailable={llmAvailable}
          packs={packs}
        />
      )}
    </div>
  );
}
