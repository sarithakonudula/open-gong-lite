import { NextRequest, NextResponse } from "next/server";
import {
  HubspotError,
  hubspotConfigured,
  openDealCandidatesForCompany,
  syncRunToHubspot,
} from "@/lib/hubspot";
import { computeMomentum, renderMomentum } from "@/lib/momentum";
import { loadSample } from "@/lib/samples";
import { getRun, saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { runId, company?, dealId? } — write this run's gated notes + momentum
 * back to a HubSpot deal.
 *
 * Deal resolution ladder (name matching proposes, never writes):
 * 1. explicit dealId in the body (a human picked it)
 * 2. the run's stored crm link (a human picked it before)
 * 3. exactly ONE open-deal candidate for the company name
 * Anything ambiguous returns { needsSelection, candidates } for the UI picker.
 * A successful sync persists the link on the run for next time.
 */
export async function POST(request: NextRequest) {
  if (!hubspotConfigured()) {
    return NextResponse.json(
      { error: "HubSpot is not configured — add a private-app token on /admin" },
      { status: 400 },
    );
  }

  let runId = "";
  let company = "";
  let dealId: string | undefined;
  try {
    const body = (await request.json()) as {
      runId?: unknown;
      company?: unknown;
      dealId?: unknown;
    };
    runId = String(body.runId ?? "");
    company = String(body.company ?? "").trim();
    if (typeof body.dealId === "string" && /^\d{1,20}$/.test(body.dealId)) {
      dealId = body.dealId;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!run.notes) {
    return NextResponse.json(
      { error: "Run has no shipped notes to sync" },
      { status: 400 },
    );
  }

  if (!company) {
    const sample = run.sampleSlug ? await loadSample(run.sampleSlug) : null;
    company = run.crm?.company ?? sample?.meta.company ?? run.sourceLabel;
  }

  try {
    if (!dealId && run.crm?.dealId) {
      dealId = run.crm.dealId;
    }
    if (!dealId) {
      const candidates = await openDealCandidatesForCompany(company);
      if (candidates.length === 1) {
        dealId = candidates[0]!.id;
      } else {
        return NextResponse.json({
          needsSelection: true,
          company,
          candidates,
        });
      }
    }

    const momentum = computeMomentum(run.notes);
    const result = await syncRunToHubspot(run, {
      company,
      dealId,
      momentum,
      momentumBlock: renderMomentum(momentum),
    });
    await saveRun({
      ...run,
      crm: {
        dealId: result.dealId,
        dealName: result.dealName,
        company,
        linkedAt: new Date().toISOString(),
      },
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof HubspotError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 404 ? 404 : 502 },
      );
    }
    return NextResponse.json({ error: "HubSpot sync failed" }, { status: 502 });
  }
}
