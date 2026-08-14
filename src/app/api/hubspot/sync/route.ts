import { NextRequest, NextResponse } from "next/server";
import {
  HubspotError,
  hubspotConfigured,
  syncRunToHubspot,
} from "@/lib/hubspot";
import { computeMomentum, renderMomentum } from "@/lib/momentum";
import { loadSample } from "@/lib/samples";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { runId, company?, dealId? } — write this run's gated notes + momentum
 * back to the matching HubSpot deal: ai_* properties + a timeline note.
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
    company = sample?.meta.company ?? run.notes.title ?? run.sourceLabel;
  }

  const momentum = computeMomentum(run.notes);
  try {
    const result = await syncRunToHubspot(run, {
      company,
      dealId,
      momentum,
      momentumBlock: renderMomentum(momentum),
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
