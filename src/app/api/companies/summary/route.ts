// Deal summary per company: cache-or-generate. GET serves the cached summary
// when the cluster hasn't changed; POST forces a regeneration. The payload
// carries run ids, titles, quotes, and timestamps only — never shareTokens or
// transcripts.

import { NextRequest, NextResponse } from "next/server";
import { buildSampleCompanyIndex, groupRunsByCompany } from "@/lib/company";
import {
  collectCompanyEvidence,
  generateDealSummary,
  type DealSummary,
} from "@/lib/deal-summary";
import {
  dealSummaryInputsHash,
  dedupeInFlight,
  readCachedDealSummary,
  writeCachedDealSummary,
} from "@/lib/deal-summary-store";
import { hasLlmAvailable } from "@/lib/llm";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

async function summarize(
  companyKey: string,
  force: boolean,
): Promise<
  | { status: 200; body: { summary: DealSummary; cached: boolean } }
  | { status: 404; body: { error: string } }
> {
  const [runs, samples] = await Promise.all([listFullRuns(200), listSamples()]);
  const index = buildSampleCompanyIndex(samples);
  const group = groupRunsByCompany(runs, index).find(
    (g) => g.key === companyKey,
  );
  if (!group || !group.runs.some((run) => run.notes)) {
    return {
      status: 404,
      body: { error: "No analyzed calls for this company" },
    };
  }

  const generator = (await hasLlmAvailable()) ? "llm" : "deterministic";
  const hash = dealSummaryInputsHash(group.runs, generator);

  if (!force) {
    const cached = await readCachedDealSummary(companyKey);
    if (cached && cached.inputsHash === hash) {
      return { status: 200, body: { summary: cached.summary, cached: true } };
    }
  }

  const summary = await dedupeInFlight(companyKey, async () => {
    const evidence = collectCompanyEvidence(group);
    const generated = await generateDealSummary(evidence);
    await writeCachedDealSummary({
      schema: "opengong.deal-summary-cache",
      version: 1,
      companyKey,
      inputsHash: dealSummaryInputsHash(group.runs, generated.generator),
      summary: generated,
    });
    return generated;
  });

  return { status: 200, body: { summary, cached: false } };
}

export async function GET(request: NextRequest) {
  const companyKey = request.nextUrl.searchParams.get("company") ?? "";
  if (!/^[a-z0-9-]{1,120}$/.test(companyKey)) {
    return NextResponse.json({ error: "Invalid company key" }, { status: 400 });
  }
  const result = await summarize(companyKey, false);
  return NextResponse.json(result.body, { status: result.status });
}

/** POST { company } — regenerate even when the cache is fresh. */
export async function POST(request: NextRequest) {
  let companyKey = "";
  try {
    const body = (await request.json()) as { company?: unknown };
    if (typeof body.company === "string") companyKey = body.company;
  } catch {
    // body required below
  }
  if (!/^[a-z0-9-]{1,120}$/.test(companyKey)) {
    return NextResponse.json({ error: "Invalid company key" }, { status: 400 });
  }
  const result = await summarize(companyKey, true);
  return NextResponse.json(result.body, { status: result.status });
}
