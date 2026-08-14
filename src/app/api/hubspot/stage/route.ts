import { NextRequest, NextResponse } from "next/server";
import {
  HubspotError,
  hubspotConfigured,
  moveDealStage,
} from "@/lib/hubspot";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST { runId, dealId, stageId, reason } — perform a rep-APPROVED stage
 * move. The suggestion comes from the sync response; this endpoint only
 * executes what a human clicked, and writes a note explaining why.
 */
export async function POST(request: NextRequest) {
  if (!hubspotConfigured()) {
    return NextResponse.json({ error: "HubSpot is not configured" }, { status: 400 });
  }
  let runId = "";
  let dealId = "";
  let stageId = "";
  let reason = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    runId = String(body.runId ?? "");
    dealId = String(body.dealId ?? "");
    stageId = String(body.stageId ?? "");
    reason = String(body.reason ?? "").slice(0, 500);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !/^\d{1,20}$/.test(dealId) || !stageId) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }
  // The run's confirmed CRM link must match — no moving arbitrary deals.
  const run = await getRun(runId);
  if (!run?.crm?.dealId || run.crm.dealId !== dealId) {
    return NextResponse.json(
      { error: "Run is not linked to this deal — sync it first" },
      { status: 400 },
    );
  }
  try {
    await moveDealStage(dealId, stageId, reason || "Approved from the run page.");
    return NextResponse.json({ moved: true });
  } catch (error) {
    if (error instanceof HubspotError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Stage move failed" }, { status: 502 });
  }
}
