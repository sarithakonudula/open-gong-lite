import { NextRequest, NextResponse } from "next/server";
import { hubspotConfigured, listClosedDeals } from "@/lib/hubspot";
import { chatText } from "@/lib/llm";
import {
  buildHubspotPlaybook,
  buildLocalPlaybook,
  extractDealAttributes,
  gateSynthesizedInsights,
  Playbook,
  rankSimilarDeals,
} from "@/lib/playbook";
import { listSamples } from "@/lib/samples";
import { getRun, listFullRuns } from "@/lib/store";
import { hasLlmConfigured } from "@/lib/settings";
import { RunRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { runId } — Flow 4: similar-deal playbook for this call's deal.
 * HubSpot mode mines real closed-won/lost deals; keyless mode mines your
 * own analyzed calls and says so. Optional LLM pass may only rephrase —
 * insights citing unknown deals are dropped and the drop count reported.
 */
export async function POST(request: NextRequest) {
  let runId = "";
  try {
    runId = String(((await request.json()) as { runId?: unknown }).runId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }
  const run = await getRun(runId);
  if (!run || !run.notes) {
    return NextResponse.json({ error: "Run not found or has no notes" }, { status: 404 });
  }

  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));
  const slugToCompany = Object.fromEntries(samples.map((s) => [s.slug, s.company]));
  const companyForRun = (r: RunRecord): string => {
    const slug =
      r.sampleSlug || (r.source === "sample" ? titleToSlug[r.sourceLabel] : undefined);
    return (slug && slugToCompany[slug]) || r.crm?.company || r.sourceLabel;
  };

  const attrs = extractDealAttributes(run, companyForRun(run));

  let playbook: Playbook;
  if (hubspotConfigured()) {
    try {
      const closed = await listClosedDeals(50);
      const { won, lost } = rankSimilarDeals(attrs, closed);
      playbook = buildHubspotPlaybook(attrs, won, lost);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `HubSpot history unavailable: ${error.message.slice(0, 200)}`
              : "HubSpot history unavailable",
        },
        { status: 502 },
      );
    }
  } else {
    const runs = await listFullRuns(100);
    playbook = buildLocalPlaybook(attrs, runs, companyForRun);
  }

  // Optional LLM polish: rephrase/prioritize the deterministic patterns into
  // sharper recommendations — gated so it can only cite known deals/calls.
  let dropped = 0;
  if (hasLlmConfigured()) {
    const knownRefs = [
      ...playbook.winPatterns,
      ...playbook.lossPatterns,
      ...playbook.recommendations,
    ].flatMap((i) => i.refs);
    if (knownRefs.length > 0) {
      try {
        const raw = await chatText({
          system: `You turn win/loss patterns into a short path-to-close. Return ONLY JSON: {"insights":[{"text": string, "refs": string[]}]}. Rules: refs must ONLY contain names from the provided list — never invent a deal. 2-4 insights, each one concrete action for the rep. No generic sales advice.`,
          user: `Current deal: ${JSON.stringify(playbook.attrs)}\nKnown deal/call names: ${JSON.stringify([...new Set(knownRefs)])}\nPatterns: ${JSON.stringify({ win: playbook.winPatterns, loss: playbook.lossPatterns })}`,
        });
        const gated = gateSynthesizedInsights(JSON.parse(raw), knownRefs);
        dropped = gated.dropped;
        if (gated.insights.length > 0) {
          playbook = { ...playbook, recommendations: gated.insights };
        }
      } catch {
        // deterministic playbook stands on its own
      }
    }
  }

  return NextResponse.json({ playbook, droppedInsights: dropped });
}
