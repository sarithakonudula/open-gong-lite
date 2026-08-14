// HubSpot action layer — the write-back that turns notes into CRM state.
//
// Token comes from admin settings (or HUBSPOT_ACCESS_TOKEN). A HubSpot
// private app needs: crm.objects.companies.read, crm.objects.deals.read/write,
// crm.objects.contacts.read, crm.objects.notes.write (or full crm.objects),
// crm.schemas.deals.write (to auto-create the ai_* properties).
//
// Pure mapping helpers (momentumToDealProperties, alertToTaskProperties,
// textToNoteHtml) are exported separately so they stay unit-testable with no
// network.

import { DealAlert, toCrmTaskPayload } from "@/lib/deal-signals";
import { notesToMarkdown } from "@/lib/export";
import { MomentumResult } from "@/lib/momentum";
import { resolveHubspotToken } from "@/lib/settings";
import { RunRecord } from "@/lib/types";

const HUBSPOT_BASE = "https://api.hubapi.com";
/** HubSpot-defined default association type ids. */
const NOTE_TO_DEAL = 214;
const TASK_TO_DEAL = 216;

export class HubspotError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HubspotError";
    this.status = status;
  }
}

export function hubspotConfigured(): boolean {
  return resolveHubspotToken() !== null;
}

async function hsFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = resolveHubspotToken();
  if (!token) throw new HubspotError(0, "HubSpot is not configured — add a private-app token on /admin");
  const response = await fetch(`${HUBSPOT_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (body as { message?: string } | null)?.message ??
      `HubSpot request failed (${response.status})`;
    throw new HubspotError(response.status, message);
  }
  return body;
}

// ── Pure mapping (unit-tested, no network) ──────────────────────────────────

export const AI_DEAL_PROPERTIES = [
  { name: "ai_momentum_score", label: "AI momentum score", type: "number", fieldType: "number" },
  { name: "ai_momentum_direction", label: "AI momentum direction", type: "string", fieldType: "text" },
  { name: "ai_next_action", label: "AI next action", type: "string", fieldType: "text" },
  { name: "ai_last_followup", label: "AI last follow-up", type: "string", fieldType: "text" },
  { name: "ai_risk_level", label: "AI risk level", type: "string", fieldType: "text" },
] as const;

export function momentumToDealProperties(
  m: MomentumResult,
  at: string,
): Record<string, string> {
  return {
    ai_momentum_score: String(m.score),
    ai_momentum_direction: m.direction,
    ai_next_action: (m.nextAction ?? "").slice(0, 250),
    ai_last_followup: at,
    ai_risk_level: m.direction === "at_risk" ? "at_risk" : m.direction === "stalling" ? "watch" : "none",
  };
}

export function alertToTaskProperties(
  alert: DealAlert,
  company: string,
  at: string,
): Record<string, string> {
  const payload = toCrmTaskPayload(alert, company);
  return {
    hs_task_subject: payload.title.slice(0, 250),
    hs_task_body: payload.body.slice(0, 5000),
    hs_task_priority: payload.priority,
    hs_task_status: "NOT_STARTED",
    hs_timestamp: at,
  };
}

/** HubSpot note bodies are HTML; newlines are ignored unless converted. */
export function textToNoteHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br>").slice(0, 60_000);
}

export function noteBodyForRun(run: RunRecord, momentumBlock: string): string {
  return [
    `OpenGong Lite call notes — ${run.notes?.title ?? run.sourceLabel}`,
    "",
    momentumBlock,
    "",
    notesToMarkdown(run),
  ].join("\n");
}

// ── CRM reads ───────────────────────────────────────────────────────────────

export type HsCompany = { id: string; name: string; domain: string | null };
export type HsDeal = {
  id: string;
  name: string;
  amount: number | null;
  stage: string | null;
  pipeline: string | null;
  lastModified: string | null;
  lastNoteAt: string | null;
  createdAt: string | null;
  isClosed: boolean;
};
export type HsContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
};

type SearchResponse = {
  results?: Array<{ id: string; properties?: Record<string, string | null> }>;
};

function prop(r: { properties?: Record<string, string | null> }, key: string): string | null {
  return r.properties?.[key] ?? null;
}

export async function searchCompanyByName(name: string): Promise<HsCompany | null> {
  const body = (await hsFetch("/crm/v3/objects/companies/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: "name", operator: "CONTAINS_TOKEN", value: name },
          ],
        },
      ],
      properties: ["name", "domain"],
      limit: 1,
    }),
  })) as SearchResponse;
  const hit = body.results?.[0];
  if (!hit) return null;
  return { id: hit.id, name: prop(hit, "name") ?? name, domain: prop(hit, "domain") };
}

const DEAL_PROPERTIES = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "hs_lastmodifieddate",
  "notes_last_updated",
  "createdate",
  "hs_is_closed",
];

function toDeal(r: { id: string; properties?: Record<string, string | null> }): HsDeal {
  const amount = Number(prop(r, "amount"));
  return {
    id: r.id,
    name: prop(r, "dealname") ?? `Deal ${r.id}`,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    stage: prop(r, "dealstage"),
    pipeline: prop(r, "pipeline"),
    lastModified: prop(r, "hs_lastmodifieddate"),
    lastNoteAt: prop(r, "notes_last_updated"),
    createdAt: prop(r, "createdate"),
    isClosed: prop(r, "hs_is_closed") === "true",
  };
}

export async function dealsForCompany(companyId: string): Promise<HsDeal[]> {
  const assoc = (await hsFetch(
    `/crm/v4/objects/companies/${companyId}/associations/deals?limit=20`,
  )) as { results?: Array<{ toObjectId: number | string }> };
  const ids = (assoc.results ?? []).map((r) => String(r.toObjectId));
  if (ids.length === 0) return [];
  const batch = (await hsFetch("/crm/v3/objects/deals/batch/read", {
    method: "POST",
    body: JSON.stringify({
      properties: DEAL_PROPERTIES,
      inputs: ids.map((id) => ({ id })),
    }),
  })) as SearchResponse;
  return (batch.results ?? []).map(toDeal);
}

export async function listOpenDeals(limit = 20): Promise<HsDeal[]> {
  const body = (await hsFetch("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_is_closed", operator: "EQ", value: "false" },
          ],
        },
      ],
      properties: DEAL_PROPERTIES,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      limit: Math.min(Math.max(limit, 1), 100),
    }),
  })) as SearchResponse;
  return (body.results ?? []).map(toDeal);
}

export async function contactsForDeal(dealId: string): Promise<HsContact[]> {
  const assoc = (await hsFetch(
    `/crm/v4/objects/deals/${dealId}/associations/contacts?limit=5`,
  )) as { results?: Array<{ toObjectId: number | string }> };
  const ids = (assoc.results ?? []).map((r) => String(r.toObjectId));
  if (ids.length === 0) return [];
  const batch = (await hsFetch("/crm/v3/objects/contacts/batch/read", {
    method: "POST",
    body: JSON.stringify({
      properties: ["firstname", "lastname", "email", "jobtitle"],
      inputs: ids.map((id) => ({ id })),
    }),
  })) as SearchResponse;
  return (batch.results ?? []).map((r) => ({
    id: r.id,
    firstName: prop(r, "firstname"),
    lastName: prop(r, "lastname"),
    email: prop(r, "email"),
    jobTitle: prop(r, "jobtitle"),
  }));
}

export async function getPortalId(): Promise<number | null> {
  try {
    const body = (await hsFetch("/account-info/v3/details")) as {
      portalId?: number;
    };
    return body.portalId ?? null;
  } catch {
    return null;
  }
}

export function dealUrl(portalId: number | null, dealId: string): string | null {
  return portalId ? `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}` : null;
}

// ── CRM writes ──────────────────────────────────────────────────────────────

/** Create the ai_* deal properties once; existing ones are left alone. */
export async function ensureAiDealProperties(): Promise<string[]> {
  const created: string[] = [];
  for (const p of AI_DEAL_PROPERTIES) {
    try {
      await hsFetch(`/crm/v3/properties/deals/${p.name}`);
    } catch (error) {
      if (!(error instanceof HubspotError) || error.status !== 404) throw error;
      await hsFetch("/crm/v3/properties/deals", {
        method: "POST",
        body: JSON.stringify({
          name: p.name,
          label: p.label,
          type: p.type,
          fieldType: p.fieldType,
          groupName: "dealinformation",
          description: "Written by OpenGong Lite",
        }),
      });
      created.push(p.name);
    }
  }
  return created;
}

export async function updateDealProperties(
  dealId: string,
  properties: Record<string, string>,
): Promise<void> {
  await hsFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function createNoteForDeal(
  dealId: string,
  text: string,
): Promise<string | null> {
  const body = (await hsFetch("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: textToNoteHtml(text),
        hs_timestamp: new Date().toISOString(),
      },
      associations: [
        {
          to: { id: dealId },
          types: [
            { associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_DEAL },
          ],
        },
      ],
    }),
  })) as { id?: string };
  return body?.id ?? null;
}

export async function createTaskForDeal(
  dealId: string,
  properties: Record<string, string>,
): Promise<string | null> {
  const body = (await hsFetch("/crm/v3/objects/tasks", {
    method: "POST",
    body: JSON.stringify({
      properties,
      associations: [
        {
          to: { id: dealId },
          types: [
            { associationCategory: "HUBSPOT_DEFINED", associationTypeId: TASK_TO_DEAL },
          ],
        },
      ],
    }),
  })) as { id?: string };
  return body?.id ?? null;
}

// ── Deal candidates (proposal only — writes require a confirmed id) ─────────

export type DealCandidate = {
  id: string;
  name: string;
  stage: string | null;
  amount: number | null;
  isClosed: boolean;
};

/**
 * Open deals for a company name match. Callers must NOT write to a candidate
 * unless it is the only one or a human picked it — name matching is fuzzy.
 */
export async function openDealCandidatesForCompany(
  companyName: string,
): Promise<DealCandidate[]> {
  const company = await searchCompanyByName(companyName);
  if (!company) return [];
  const deals = await dealsForCompany(company.id);
  const open = deals.filter((d) => !d.isClosed);
  return (open.length > 0 ? open : deals).map((d) => ({
    id: d.id,
    name: d.name,
    stage: d.stage,
    amount: d.amount,
    isClosed: d.isClosed,
  }));
}

// ── Context pull for the follow-up email ────────────────────────────────────

export type DealContext = {
  company: string;
  deal: HsDeal;
  contacts: HsContact[];
  url: string | null;
};

export async function resolveDealForCompany(
  companyName: string,
  explicitDealId?: string,
): Promise<DealContext | null> {
  if (explicitDealId) {
    const batch = (await hsFetch("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: DEAL_PROPERTIES,
        inputs: [{ id: explicitDealId }],
      }),
    })) as SearchResponse;
    const hit = batch.results?.[0];
    if (!hit) return null;
    const deal = toDeal(hit);
    const contacts = await contactsForDeal(deal.id);
    return {
      company: companyName,
      deal,
      contacts,
      url: dealUrl(await getPortalId(), deal.id),
    };
  }
  const company = await searchCompanyByName(companyName);
  if (!company) return null;
  const deals = await dealsForCompany(company.id);
  const open = deals.filter((d) => !d.isClosed);
  const deal = open[0] ?? deals[0];
  if (!deal) return null;
  const contacts = await contactsForDeal(deal.id);
  return {
    company: company.name,
    deal,
    contacts,
    url: dealUrl(await getPortalId(), deal.id),
  };
}

// ── Run sync orchestrator ───────────────────────────────────────────────────

export type SyncResult = {
  dealId: string;
  dealName: string;
  noteId: string | null;
  createdProperties: string[];
  momentumScore: number;
  momentumDirection: string;
  url: string | null;
};

export async function syncRunToHubspot(
  run: RunRecord,
  opts: {
    company: string;
    dealId?: string;
    momentum: MomentumResult;
    momentumBlock: string;
  },
): Promise<SyncResult> {
  const ctx = await resolveDealForCompany(opts.company, opts.dealId);
  if (!ctx) {
    throw new HubspotError(
      404,
      `No HubSpot company/deal found matching ${JSON.stringify(opts.company)}`,
    );
  }
  const createdProperties = await ensureAiDealProperties();
  await updateDealProperties(
    ctx.deal.id,
    momentumToDealProperties(opts.momentum, new Date().toISOString()),
  );
  const noteId = await createNoteForDeal(
    ctx.deal.id,
    noteBodyForRun(run, opts.momentumBlock),
  );
  return {
    dealId: ctx.deal.id,
    dealName: ctx.deal.name,
    noteId,
    createdProperties,
    momentumScore: opts.momentum.score,
    momentumDirection: opts.momentum.direction,
    url: ctx.url,
  };
}
