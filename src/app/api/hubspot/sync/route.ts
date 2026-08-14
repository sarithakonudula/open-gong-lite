import { NextRequest, NextResponse } from "next/server";
import { detectCallKind, KIND_LABEL } from "@/lib/call-kind";
import {
  getDealPipelineStages,
  HubspotError,
  hubspotConfigured,
  openDealCandidatesForCompany,
  StageSuggestion,
  suggestStageMove,
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

    // Momentum is a sales metric — a support or CS call never writes
    // ai_momentum_* onto the deal, though its cited notes still land.
    const kind = detectCallKind(run.transcript);
    const momentum =
      kind.kind === "sales" ? computeMomentum(run.notes) : undefined;
    const result = await syncRunToHubspot(run, {
      company,
      dealId,
      momentum,
      momentumBlock: momentum
        ? renderMomentum(momentum)
        : `Call kind: ${KIND_LABEL[kind.kind]} — deal momentum not applicable.`,
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

    // Approval-gated stage suggestion: only an advancing sales call with a
    // verified next step proposes moving one stage forward; the rep clicks
    // to approve, nothing moves on its own.
    let stageSuggestion: StageSuggestion | null = null;
    if (momentum && result.pipeline && result.stage) {
      try {
        const stages = await getDealPipelineStages(result.pipeline);
        stageSuggestion = suggestStageMove(result.stage, stages, momentum);
      } catch {
        // suggestion is best-effort; the sync already succeeded
      }
    }

    return NextResponse.json({ result, stageSuggestion });
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
