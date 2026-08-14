import { NextRequest, NextResponse } from "next/server";
import {
  composeContextualEmail,
  composeEmail,
  CrmEmailContext,
  EmailError,
} from "@/lib/harness/email";
import {
  createNoteForDeal,
  hubspotConfigured,
  resolveDealForCompany,
} from "@/lib/hubspot";
import { chatText, hasLlmAvailable } from "@/lib/llm";
import { loadSample } from "@/lib/samples";
import { getSettings } from "@/lib/settings";
import { getRun } from "@/lib/store";
import { Claim } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function allClaims(notes: NonNullable<Awaited<ReturnType<typeof getRun>>>["notes"]): Claim[] {
  if (!notes) return [];
  return [
    ...notes.summary,
    ...notes.objections,
    ...notes.intent,
    ...notes.nextSteps,
    ...(notes.pain ?? []),
    ...(notes.pricing ?? []),
    ...(notes.competitors ?? []),
  ];
}

/**
 * POST { runId, company?, dealId?, log? } — CRM-context follow-up email.
 * LLM sees verified claims + CRM facts only (never the transcript); output is
 * post-gated. Falls back to the deterministic draft when LLM/CRM are absent
 * or a gate rejects the draft.
 */
export async function POST(request: NextRequest) {
  let runId = "";
  let company = "";
  let dealId: string | undefined;
  let log = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    runId = String(body.runId ?? "");
    company = String(body.company ?? "").trim();
    if (typeof body.dealId === "string" && /^\d{1,20}$/.test(body.dealId)) {
      dealId = body.dealId;
    }
    log = body.log === true;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!run.notes) {
    return NextResponse.json({ error: "Run has no notes" }, { status: 400 });
  }

  const claims = allClaims(run.notes);
  const title = run.notes.title || run.sourceLabel;

  if (!company) {
    const sample = run.sampleSlug ? await loadSample(run.sampleSlug) : null;
    company = run.crm?.company ?? sample?.meta.company ?? "";
  }
  // A previously confirmed deal link beats name-based resolution.
  if (!dealId && run.crm?.dealId) dealId = run.crm.dealId;

  // CRM context pull — optional, additive.
  let context: CrmEmailContext = company ? { company } : {};
  let crmDealId: string | null = null;
  if (hubspotConfigured() && company) {
    try {
      const ctx = await resolveDealForCompany(company, dealId);
      if (ctx) {
        crmDealId = ctx.deal.id;
        context = {
          company: ctx.company,
          contactFirstName: ctx.contacts[0]?.firstName ?? undefined,
          dealStage: ctx.deal.stage ?? undefined,
          recentActivity: [
            ctx.deal.lastNoteAt
              ? `Last CRM note: ${ctx.deal.lastNoteAt.slice(0, 10)}`
              : null,
            ctx.deal.amount ? `Deal size: $${ctx.deal.amount}` : null,
          ].filter((s): s is string => s != null),
        };
      }
    } catch {
      // CRM context is best-effort; the choke does not depend on it.
    }
  }

  let draft: { subject: string; body: string };
  let source: "llm_crm" | "deterministic" = "deterministic";
  let fallbackReason: string | null = null;

  if (await hasLlmAvailable()) {
    try {
      const contextual = await composeContextualEmail({
        claims,
        title,
        context,
        chat: chatText,
        guidance: getSettings().emailGuidance || undefined,
      });
      draft = contextual;
      source = "llm_crm";
    } catch (error) {
      fallbackReason =
        error instanceof EmailError ? error.code : "llm_error";
      draft = composeEmail(claims, { title });
    }
  } else {
    fallbackReason = "llm_not_configured";
    draft = composeEmail(claims, { title });
  }

  let loggedNoteId: string | null = null;
  if (log && crmDealId) {
    try {
      loggedNoteId = await createNoteForDeal(
        crmDealId,
        `Follow-up email drafted by OpenGong Lite\n\nSubject: ${draft.subject}\n\n${draft.body}`,
      );
    } catch {
      // logging is best-effort
    }
  }

  return NextResponse.json({
    subject: draft.subject,
    body: draft.body,
    source,
    fallbackReason,
    crmDealId,
    loggedNoteId,
  });
}
