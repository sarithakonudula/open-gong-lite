/**
 * Template routed, model drafted follow up email.
 *
 * The shape of the thing: a call's gate passed claims pick a TEMPLATE FILE off
 * the library in templates/, that template plus those claims become the
 * model's entire input, the model writes prose, and the draft comes straight
 * back through screenDraft() in src/lib/harness/email.ts, the same choke point
 * the deterministic baseline goes through, untouched. Second person rewriting
 * is allowed in the model step precisely because the screen revalidates every
 * asserting line afterwards: a bullet with no claim id is cut and counted, and
 * a bullet citing an id the gate did not pass rejects the WHOLE draft.
 *
 * Nothing here reads the transcript. The model sees claim text and the quote
 * the gate already matched, never the raw call.
 *
 * Routing is written against claim SCHEMAS (a section and the small enums that
 * section carries, derived in src/lib/template-facets.ts), never against the
 * words of any one deal. A template whose trigger cannot be answered by the
 * claims in front of it does not fire, and a call where nothing fires returns
 * null: the caller keeps the deterministic baseline email and the page renders
 * exactly as it does today. Null is a valid answer.
 */
import closePilot from "../../templates/close-pilot-confirmation.json";
import commitment from "../../templates/commitment-fulfillment.json";
import ghosted from "../../templates/ghosted-deal-nudge.json";
import noNextStep from "../../templates/no-next-step-reengagement.json";
import objectionAddressed from "../../templates/objection-addressed.json";
import postCallRecap from "../../templates/post-call-recap.json";
import postDemo from "../../templates/post-demo-followup.json";
import postDiscovery from "../../templates/post-discovery-followup.json";
import pricing from "../../templates/pricing-followup.json";

import { config } from "@/lib/config";
import { EmailError, screenDraft } from "@/lib/harness/email";
import { chatText, LlmNotConfiguredError } from "@/lib/llm";
import { detectOllama, type DetectOptions, type OllamaTier } from "@/lib/llm-detect";
import { getSettings, resolveLlm } from "@/lib/settings";
import { deriveFacets, type ClaimFacets, type TemplateSection } from "@/lib/template-facets";
import {
  isEmailableStatus,
  type Claim,
  type DealNotes,
  type RoutedFollowUpEmail,
} from "@/lib/types";

/** The library as it ships. Order here is irrelevant: priority decides. */
export const TEMPLATE_FILES: unknown[] = [
  closePilot,
  commitment,
  ghosted,
  noNextStep,
  objectionAddressed,
  postCallRecap,
  postDemo,
  postDiscovery,
  pricing,
];

const SLOT_ROLES = new Set(["outcome", "recap", "next_steps"]);
const BLOCK_TYPES = new Set(["text", "slot", "instruction"]);
const DEAL_METRICS = new Set(["open_rep_promises", "days_since_last_call"]);

export class TemplateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

// ── the template file contract ──────────────────────────────────────────────

export type WhereClause = Record<string, string[]>;

export type TriggerCondition = {
  scope?: string;
  metric?: string;
  min?: number;
  section?: string;
  extractor?: string;
  exists?: boolean;
  where?: WhereClause;
};

export type TemplateBlock = {
  type: "text" | "slot" | "instruction";
  role?: string;
  text?: string;
  fallback?: string;
  label?: string;
  hint?: string;
  section?: string;
  extractor?: string;
  scope?: string;
  source?: string;
  limit?: number;
  where?: WhereClause;
};

export type Template = {
  id: string;
  version: string;
  title: string;
  short: string;
  priority: number;
  subject: string;
  word_limit?: number;
  panel: { explainer: string };
  routing: {
    trigger: {
      any_of?: TriggerCondition[];
      all_of?: TriggerCondition[];
      none_of?: TriggerCondition[];
    };
  };
  blocks: TemplateBlock[];
};

const norm = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Deliberately strict and deliberately dumb. A template is data on disk, so a
 * typo in a field name has to fail loudly at load, never route silently to
 * nothing at nine in the morning on demo day.
 */
export function validateTemplate(template: unknown): Template {
  if (!isObj(template)) {
    throw new TemplateError("TEMPLATE_INVALID", "template must be an object");
  }
  const t = template;
  const where = (msg: string) =>
    `template ${JSON.stringify(t.id ?? "(no id)")}: ${msg}`;

  for (const field of ["id", "version", "title", "short", "subject"]) {
    const value = t[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new TemplateError(
        "TEMPLATE_INVALID",
        where(`${field} must be a non-empty string`),
      );
    }
  }
  if (!Number.isFinite(t.priority)) {
    throw new TemplateError("TEMPLATE_INVALID", where("priority must be a number"));
  }
  const panel = t.panel;
  if (!isObj(panel) || typeof panel.explainer !== "string" || !panel.explainer.trim()) {
    throw new TemplateError(
      "TEMPLATE_INVALID",
      where("panel.explainer must be a non-empty string"),
    );
  }
  const routing = t.routing;
  if (!isObj(routing) || !isObj(routing.trigger)) {
    throw new TemplateError(
      "TEMPLATE_INVALID",
      where("routing.trigger must be an object"),
    );
  }
  const trigger = routing.trigger as Record<string, unknown>;
  for (const key of Object.keys(trigger)) {
    if (!["any_of", "all_of", "none_of"].includes(key)) {
      throw new TemplateError(
        "TEMPLATE_INVALID",
        where(`unknown trigger key ${JSON.stringify(key)}`),
      );
    }
    const list = trigger[key];
    if (!Array.isArray(list)) {
      throw new TemplateError("TEMPLATE_INVALID", where(`trigger.${key} must be an array`));
    }
    for (const cond of list) validateCondition(cond, where);
  }
  const anyOf = trigger.any_of as unknown[] | undefined;
  const allOf = trigger.all_of as unknown[] | undefined;
  // A trigger that only says none_of fires on every call that is missing
  // something, which is not a trigger, that is a catch all.
  if (!anyOf?.length && !allOf?.length) {
    throw new TemplateError(
      "TEMPLATE_INVALID",
      where("trigger needs at least one any_of or all_of condition"),
    );
  }
  if (!Array.isArray(t.blocks) || t.blocks.length === 0) {
    throw new TemplateError("TEMPLATE_INVALID", where("blocks must be a non-empty array"));
  }
  for (const raw of t.blocks) {
    if (!isObj(raw) || typeof raw.type !== "string" || !BLOCK_TYPES.has(raw.type)) {
      throw new TemplateError(
        "TEMPLATE_INVALID",
        where("every block needs type text, slot or instruction"),
      );
    }
    if ((raw.type === "text" || raw.type === "instruction") && typeof raw.text !== "string") {
      throw new TemplateError("TEMPLATE_INVALID", where(`a ${raw.type} block needs text`));
    }
    if (raw.type === "slot") {
      if (typeof raw.role !== "string" || !SLOT_ROLES.has(raw.role)) {
        throw new TemplateError(
          "TEMPLATE_INVALID",
          where(`slot role must be one of ${[...SLOT_ROLES].join(", ")}`),
        );
      }
      const dealSlot = norm(raw.scope) === "deal";
      if (!dealSlot && typeof raw.section !== "string") {
        throw new TemplateError("TEMPLATE_INVALID", where("a call slot needs a claim section"));
      }
      if (dealSlot && norm(raw.source) !== "open_rep_promises") {
        throw new TemplateError("TEMPLATE_INVALID", where("a deal slot needs a known source"));
      }
      if (raw.where !== undefined) validateWhere(raw.where, where);
    }
  }
  return t as unknown as Template;
}

function validateWhere(clause: unknown, where: (msg: string) => string): void {
  if (!isObj(clause)) {
    throw new TemplateError(
      "TEMPLATE_INVALID",
      where("where must be an object of field to allowed values"),
    );
  }
  for (const [field, allowed] of Object.entries(clause)) {
    if (!Array.isArray(allowed) || allowed.length === 0) {
      throw new TemplateError(
        "TEMPLATE_INVALID",
        where(`where.${field} must be a non-empty array`),
      );
    }
  }
}

function validateCondition(cond: unknown, where: (msg: string) => string): void {
  if (!isObj(cond)) {
    throw new TemplateError("TEMPLATE_INVALID", where("every condition must be an object"));
  }
  if (norm(cond.scope) === "deal") {
    if (!DEAL_METRICS.has(norm(cond.metric))) {
      throw new TemplateError(
        "TEMPLATE_INVALID",
        where(`unknown deal metric ${JSON.stringify(cond.metric)}`),
      );
    }
    if (cond.min !== undefined && !Number.isFinite(cond.min)) {
      throw new TemplateError("TEMPLATE_INVALID", where("condition min must be a number"));
    }
    return;
  }
  if (typeof cond.section !== "string" && typeof cond.extractor !== "string") {
    throw new TemplateError(
      "TEMPLATE_INVALID",
      where("a call condition needs a section or an extractor"),
    );
  }
  if (cond.where !== undefined) validateWhere(cond.where, where);
}

/** The library, validated once. A broken file fails here, at import time. */
export function templateLibrary(): Template[] {
  return TEMPLATE_FILES.map((t) => validateTemplate(t));
}

// ── the claim pool ──────────────────────────────────────────────────────────

/** A gate graded claim with the section it sat in and the facets it carries. */
export type RoutedClaim = {
  id: string;
  text: string;
  quote: string;
  status: Claim["status"];
  section: TemplateSection;
  facets: ClaimFacets;
  callId?: string;
};

const SECTION_OF: Array<[keyof DealNotes, TemplateSection]> = [
  ["summary", "summary"],
  ["objections", "objections"],
  ["intent", "intent"],
  ["nextSteps", "next_steps"],
  ["pain", "pain"],
  ["pricing", "pricing"],
  ["competitors", "competitors"],
];

/** The id the screen keys on, so routing and the screen can never disagree. */
export function claimKey(claim: Claim): string {
  return claim.id || claim.evidence.lineId;
}

/** Every claim on the call, in routing shape, whatever the gate said about it. */
export function allClaims(notes: DealNotes): Claim[] {
  const out: Claim[] = [];
  for (const [key] of SECTION_OF) {
    const list = notes[key];
    if (Array.isArray(list)) out.push(...(list as Claim[]));
  }
  return out;
}

function toRouted(claim: Claim, section: TemplateSection): RoutedClaim {
  return {
    id: claimKey(claim),
    text: claim.text,
    quote: claim.evidence.quote,
    status: claim.status,
    section,
    facets: deriveFacets(section, claim.text),
  };
}

/**
 * The ONLY claims routing and rendering ever see. Everything the gate did not
 * pass is gone before a trigger is read, so a planted line can never be the
 * reason a template fires.
 */
export function backedClaims(notes: DealNotes): RoutedClaim[] {
  const out: RoutedClaim[] = [];
  for (const [key, section] of SECTION_OF) {
    const list = notes[key];
    if (!Array.isArray(list)) continue;
    for (const claim of list as Claim[]) {
      if (!claim || typeof claim.text !== "string") continue;
      if (!claim.evidence || typeof claim.evidence.lineId !== "string") continue;
      if (!isEmailableStatus(claim.status)) continue;
      out.push(toRouted(claim, section));
    }
  }
  return out;
}

export type PriorCall = { callId: string; notes: DealNotes };
export type DealContext = {
  daysSinceLastCall?: number;
  priorCalls?: PriorCall[];
};

/**
 * Promises the rep made on EARLIER calls of this deal, re identified by call
 * so two calls that both wrote nextSteps[0] can never be confused for each
 * other. These are gate passed claims like any other and the screen checks
 * them the same way; the only difference is which call they came from.
 */
export function openRepPromises(deal: DealContext = {}): RoutedClaim[] {
  const out: RoutedClaim[] = [];
  for (const prior of deal.priorCalls ?? []) {
    const callId = String(prior?.callId ?? "").trim();
    if (!callId || !prior?.notes) continue;
    for (const claim of backedClaims(prior.notes)) {
      if (claim.section !== "next_steps") continue;
      if (claim.facets.owner !== "rep") continue;
      if (claim.facets.type === "no_next_step") continue;
      out.push({ ...claim, id: `${callId}:${claim.id}`, callId });
    }
  }
  return out;
}

function dealMetrics(deal: DealContext = {}): Record<string, number> {
  const days = Number(deal.daysSinceLastCall);
  return {
    open_rep_promises: openRepPromises(deal).length,
    days_since_last_call: Number.isFinite(days) ? days : NaN,
  };
}

function facetValue(claim: RoutedClaim, field: string): string {
  const facets = claim.facets as Record<string, string | undefined>;
  return norm(facets[field]);
}

function matchesWhere(claim: RoutedClaim, clause?: WhereClause): boolean {
  for (const [field, allowed] of Object.entries(clause ?? {})) {
    const value = facetValue(claim, field);
    if (!value) return false;
    if (!allowed.some((a) => norm(a) === value)) return false;
  }
  return true;
}

/**
 * This extractor runs one pass over the whole call, so a template asking for
 * the `next_steps` extractor and a template asking for the `next_steps`
 * section are asking the same question here.
 */
function selectClaims(
  pool: RoutedClaim[],
  spec: { section?: string; extractor?: string; where?: WhereClause },
): RoutedClaim[] {
  return pool.filter((c) => {
    if (spec.section && c.section !== norm(spec.section)) return false;
    if (spec.extractor && c.section !== norm(spec.extractor)) return false;
    return matchesWhere(c, spec.where);
  });
}

type RouteEnv = { pool: RoutedClaim[]; metrics: Record<string, number> };

function evalCondition(cond: TriggerCondition, env: RouteEnv): boolean {
  if (norm(cond.scope) === "deal") {
    const value = env.metrics[norm(cond.metric)];
    // No deal context, or a metric this deal cannot answer, is a quiet false.
    // A template never fires on a number nobody supplied.
    if (!Number.isFinite(value)) return false;
    return value >= (cond.min ?? 1);
  }
  const n = selectClaims(env.pool, cond).length;
  if (cond.exists === false) return n === 0;
  return n >= (cond.min ?? 1);
}

export function triggerFires(template: Template, env: RouteEnv): boolean {
  const t = template.routing.trigger;
  const any = t.any_of?.length ? t.any_of.some((c) => evalCondition(c, env)) : true;
  if (!any) return false;
  const all = t.all_of?.length ? t.all_of.every((c) => evalCondition(c, env)) : true;
  if (!all) return false;
  return t.none_of?.length ? !t.none_of.some((c) => evalCondition(c, env)) : true;
}

// ── routing ─────────────────────────────────────────────────────────────────

export type RenderOptions = {
  deal?: DealContext;
  recipient?: string | null;
  sender?: string | null;
  dealName?: string | null;
  title?: string | null;
  /**
   * When set, skip priority routing and fill this library template instead.
   * The draft still only sees gate-passed claims — forcing never invents notes.
   */
  templateId?: string | null;
};

export type RouteTrace = {
  template: Template | null;
  considered: Array<{ id: string; priority: number; fired: boolean }>;
};

/**
 * Same routing, with the ladder it walked. The reason a call got the template
 * it got is which triggers said no first, and that stays inspectable.
 *
 * Pass `templateId` to force a library template the user picked. Auto-routing
 * still runs for the `considered` trace so the UI can label which templates
 * would have matched on their own.
 */
export function routeWithTrace(
  notes: DealNotes,
  templates: unknown[] | null | undefined,
  ctx: RenderOptions = {},
): RouteTrace {
  if (!isObj(notes) || !Array.isArray(notes.summary)) {
    throw new TemplateError(
      "ROUTE_INPUT_INVALID",
      "routeTemplate needs gated deal notes with claim sections",
    );
  }
  const list = (Array.isArray(templates) ? templates : []).map((t) => validateTemplate(t));
  const env: RouteEnv = {
    pool: backedClaims(notes),
    metrics: dealMetrics(ctx.deal ?? {}),
  };
  const ordered = [...list].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );
  const considered: RouteTrace["considered"] = [];
  let autoPicked: Template | null = null;
  for (const t of ordered) {
    const fired = triggerFires(t, env);
    considered.push({ id: t.id, priority: t.priority, fired });
    if (fired && !autoPicked) autoPicked = t;
  }

  const forcedId = ctx.templateId?.trim();
  if (forcedId) {
    const forced = ordered.find((t) => t.id === forcedId) ?? null;
    if (!forced) {
      throw new TemplateError(
        "TEMPLATE_NOT_FOUND",
        `unknown template id: ${forcedId}`,
      );
    }
    return { template: forced, considered };
  }

  return { template: autoPicked, considered };
}

/**
 * Picks ONE template, from gate passed claims only, in declared priority
 * order. Returns null when nothing fires, and null means the caller keeps the
 * deterministic baseline email. Pass `templateId` to force a specific file.
 */
export function routeTemplate(
  notes: DealNotes,
  templates: unknown[] | null | undefined,
  ctx: RenderOptions = {},
): Template | null {
  return routeWithTrace(notes, templates, ctx).template;
}

/** Lightweight library rows for the draft-from-template picker. */
export function listTemplatesForUi(): Array<{
  id: string;
  title: string;
  short: string;
  explainer: string;
  priority: number;
}> {
  return templateLibrary()
    .slice()
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      short: t.short,
      explainer: t.panel.explainer,
      priority: t.priority,
    }));
}

// ── the model's input ───────────────────────────────────────────────────────

export type ContextClaim = {
  id: string;
  section: string;
  text: string;
  quote: string | null;
  call_id?: string;
};

export type ContextBlock =
  | { type: "text"; role: string | null; text: string }
  | { type: "instruction"; text: string }
  | {
      type: "slot";
      role: string;
      label: string | null;
      section: string;
      hint: string | null;
      claims: ContextClaim[];
    };

export type RenderedContext = {
  template: {
    id: string;
    version: string;
    title: string;
    short: string;
    subject: string;
    word_limit: number;
    explainer: string;
  };
  blocks: ContextBlock[];
  claims: ContextClaim[];
  allowed_ids: string[];
  backed_ids: string[];
  screen_claims: Claim[];
};

function resolveText(
  text: string,
  facts: Record<string, string | null>,
): { out: string; missing: boolean } {
  let missing = false;
  const out = String(text).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = facts[key];
    if (value == null || String(value).trim() === "") {
      missing = true;
      return "";
    }
    return String(value);
  });
  return { out, missing };
}

function claimForModel(claim: RoutedClaim): ContextClaim {
  const out: ContextClaim = {
    id: claim.id,
    section: claim.section,
    text: claim.text,
    quote: claim.quote || null,
  };
  if (claim.callId) out.call_id = claim.callId;
  return out;
}

/** A prior call promise, in the shape the screen keys on. */
function promiseAsClaim(claim: RoutedClaim): Claim {
  return {
    id: claim.id,
    text: claim.text,
    evidence: { lineId: claim.id, quote: claim.quote },
    status: claim.status,
  };
}

/**
 * Everything the model is allowed to see: the template's blocks with their
 * slots already filled from gate passed claims, the claims themselves (id,
 * text, and the quote the gate matched), and the deal facts the caller owns.
 * No transcript, ever.
 */
export function renderContext(
  notes: DealNotes,
  template: Template,
  ctx: RenderOptions = {},
): RenderedContext {
  validateTemplate(template);
  const pool = backedClaims(notes);
  const dealPool = openRepPromises(ctx.deal ?? {});
  const facts: Record<string, string | null> = {
    recipient: ctx.recipient ?? null,
    sender: ctx.sender ?? null,
    call: ctx.title ?? null,
    deal: ctx.dealName ?? null,
  };

  const blocks: ContextBlock[] = [];
  const used = new Map<string, RoutedClaim>();
  for (const block of template.blocks) {
    if (block.type === "text") {
      const { out, missing } = resolveText(block.text ?? "", facts);
      const text = missing
        ? typeof block.fallback === "string"
          ? block.fallback
          : null
        : out;
      if (text) blocks.push({ type: "text", role: block.role ?? null, text });
      continue;
    }
    if (block.type === "instruction") {
      blocks.push({ type: "instruction", text: block.text ?? "" });
      continue;
    }
    const dealSlot = norm(block.scope) === "deal";
    const source = dealSlot ? dealPool : pool;
    let claims = dealSlot
      ? source
      : selectClaims(source, {
          section: block.section,
          extractor: block.extractor,
          where: block.where,
        });
    if (Number.isFinite(block.limit)) claims = claims.slice(0, Number(block.limit));
    // An empty slot renders nothing. It is never filled with a plausible line.
    if (!claims.length) continue;
    for (const c of claims) if (!used.has(c.id)) used.set(c.id, c);
    blocks.push({
      type: "slot",
      role: block.role ?? "recap",
      label: block.label ?? null,
      section: dealSlot ? "commitments" : norm(block.section),
      hint: block.hint ?? null,
      claims: claims.map(claimForModel),
    });
  }

  const offered = [...used.values()];
  return {
    template: {
      id: template.id,
      version: template.version,
      title: template.title,
      short: template.short,
      subject: template.subject,
      word_limit: template.word_limit ?? 120,
      explainer: template.panel.explainer,
    },
    blocks,
    claims: offered.map(claimForModel),
    allowed_ids: offered.map((c) => c.id),
    // Every id the gate passed on this call, offered or not. The difference
    // matters: a backed claim this template did not offer is off contract and
    // gets cut, but an id that is not in here at all is ungrounded, and an
    // ungrounded citation has to reach the screen so the screen can reject the
    // whole draft. Cutting it here would quietly downgrade the Iron Law.
    backed_ids: [...pool, ...dealPool].map((c) => c.id),
    // What the screen checks against: every claim on this call in its raw gate
    // status (so an unbacked or blocked id is rejected, never quietly missing)
    // plus the earlier call promises the deal slots offered.
    screen_claims: [...allClaims(notes), ...dealPool.map(promiseAsClaim)],
  };
}

// ── the prompt ──────────────────────────────────────────────────────────────

export const VOICE_RULES = [
  "No dashes as punctuation.",
  'Never write "X, not Y" as a rhetorical flourish.',
  "No AI filler words: delve, leverage, seamless, robust, elevate, unlock, landscape, realm, testament, tapestry, crucial, game-changer.",
  "Write as the sales rep sending the email directly to the customer.",
  'Use "I" or "we" for the rep and "you" for the customer.',
  'Never call either person "the rep", "the seller", "the customer", "the prospect", or "the buyer".',
  'Turn note-like text and labels such as "Rep:", "Customer:", and "Owner:" into complete, natural sentences.',
  "Use short, grammatically complete, human sentences.",
  "Open warmly, organize the recap clearly, and end with a professional next-step sentence or invitation to respond.",
  "Never mention claims, citations, evidence, gates, source material, templates, AI, or OpenGong in the email.",
  "Numbers exactly as the claim writes them. Never turn a number word into a digit, and never write a bare percentage.",
];

export function buildPrompt(context: RenderedContext): {
  system: string;
  user: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
} {
  const t = context.template;
  const system = [
    "You are the sales rep writing a polished follow-up email directly to the customer.",
    "Use the template for structure and the fixed set of backed claims for facts.",
    "",
    "Hard rules:",
    "1. Every sentence that asserts something about the call must come from one claim, and must carry that claim id.",
    "2. You may only use the claim ids listed. Never invent an id. Never cite a claim that is not listed.",
    "3. Never add a fact, a number, a date, a name, or a next step that is not in a listed claim.",
    '4. Rewrite third-person notes into the rep/customer perspective: "I" or "we" for the rep and "you" for the customer. Inventing is not allowed.',
    `5. The subject is 3 to 5 words, sentence case, no punctuation flourish. Start from "${t.subject}".`,
    `6. The whole email stays under about ${t.word_limit} words.`,
    "",
    "Voice:",
    ...VOICE_RULES.map((r) => `- ${r}`),
    "",
    "Return JSON only, this exact shape:",
    '{"subject":"...","greeting":"...","opener":"...","bullets":[{"claim_id":"<id>","group":"outcome|recap|next_steps","text":"..."}],"close":"...","signoff":"..."}',
    "greeting, opener, close and signoff are chrome: they assert nothing about the call and carry no claim id.",
  ].join("\n");

  const lines = [`Template: ${t.title} (${t.id}).`];
  lines.push("", "Blocks, in order:");
  for (const b of context.blocks) {
    if (b.type === "text") {
      lines.push(`- text (${b.role ?? "chrome"}): ${b.text.replace(/\n/g, " ")}`);
      continue;
    }
    if (b.type === "instruction") {
      lines.push(`- instruction: ${b.text}`);
      continue;
    }
    lines.push(`- slot (${b.role}${b.label ? `, "${b.label}"` : ""}): ${b.hint ?? ""}`);
    for (const c of b.claims) {
      lines.push(`    [${c.id}] ${c.text}`);
      if (c.quote) lines.push(`      the call said: "${c.quote}"`);
    }
  }
  lines.push("", `Claim ids you may cite: ${context.allowed_ids.join(", ")}`);
  const user = lines.join("\n");
  return {
    system,
    user,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

// ── the tier ladder ─────────────────────────────────────────────────────────

export type LlmTier =
  | { source: "configured"; baseUrl: string; apiKey: string; model: string }
  | { source: "ollama-local"; baseUrl: string; apiKey: string; model: string }
  | { source: "offline" };

export type TierOptions = {
  env?: Record<string, string | undefined>;
  detect?: (opts: DetectOptions) => Promise<OllamaTier | null>;
  fetchImpl?: typeof fetch;
  ollamaTimeoutMs?: number;
};

/**
 * What the operator configured, in the shape the ladder reads.
 *
 * resolveLlm() is the app's single answer to "which endpoint did the operator
 * pick": admin settings on /admin first, LLM_* env vars second. It returns
 * null unless BOTH a base URL and a key are present, and the ladder needs to
 * tell "nothing configured" apart from "a key but no endpoint" — a key is a
 * decision either way, and once one exists this file must not go probing
 * loopback behind the operator's back. So the null branch still looks for a
 * bare key before handing down to the probe.
 */
function configuredTarget(opts: TierOptions): Record<string, string | undefined> {
  if (opts.env) return opts.env;
  const resolved = resolveLlm();
  if (resolved) {
    return {
      LLM_API_KEY: resolved.apiKey,
      LLM_BASE_URL: resolved.baseUrl,
      LLM_MODEL: resolved.model,
    };
  }
  // resolveLlm() went null, so no source has BOTH halves. A half still counts:
  // a key with no endpoint is an operator decision, and the ladder has to see
  // it to stay off loopback.
  const s = getSettings();
  return {
    LLM_API_KEY: s.llmApiKey || config.llmApiKey || undefined,
    LLM_BASE_URL: s.llmBaseUrl || config.llmBaseUrl || undefined,
    // Deliberately the RAW model, not config.llmModel: that one carries a
    // hosted default ("gpt-4o-mini"), and handing a hosted default to the
    // Ollama probe below would make it ask a local server for a model nobody
    // pulled instead of picking one that is actually installed.
    LLM_MODEL: s.llmModel || process.env.LLM_MODEL?.trim() || undefined,
  };
}

/**
 * Which endpoint drafts the email: (1) a configured key always wins, and
 * Ollama is never even asked; (2) with no key, one short local probe, and a
 * real answer there is used keyless; (3) with neither, the caller keeps the
 * deterministic baseline email, which is what it does today.
 */
export async function resolveLlmTier(opts: TierOptions = {}): Promise<LlmTier> {
  const env = configuredTarget(opts);
  const apiKey = env.LLM_API_KEY?.trim();
  const baseUrl = env.LLM_BASE_URL?.trim();
  if (apiKey) {
    // A key is a decision. Probing localhost behind the user's back once they
    // have configured an endpoint would be a surprise, so it never happens.
    if (!baseUrl) return { source: "offline" };
    return {
      source: "configured",
      apiKey,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      model: env.LLM_MODEL?.trim() || "gpt-4o-mini",
    };
  }
  const detect = opts.detect ?? detectOllama;
  const found = await detect({
    env,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.ollamaTimeoutMs,
  });
  if (found) {
    return {
      source: "ollama-local",
      apiKey: "ollama",
      baseUrl: found.baseUrl,
      model: found.model,
    };
  }
  return { source: "offline" };
}

// ── parsing the model's answer ──────────────────────────────────────────────

export type DraftBullet = { text: string; group: string; claim_id: string | null };

export type ParsedDraft = {
  greeting: string;
  opener: string;
  assurance: string;
  signoff: string;
  bullets: DraftBullet[];
  off_template_cut: number;
};

function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1]!.trim() : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new TemplateError("DRAFT_UNPARSEABLE", "the model returned no JSON object");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new TemplateError(
      "DRAFT_UNPARSEABLE",
      `the model returned JSON that will not parse: ${(err as Error).message}`,
    );
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Strict on shape, forgiving on nothing. A bullet with no claim id survives
 * parsing on purpose: the screen is what cuts it, and the screen counts it.
 *
 * The model's own subject is read and discarded here. The subject that ships
 * is the one in the template file, because a model authored subject is exactly
 * the ungated string the choke point already refuses to let onto an envelope.
 */
export function parseDraft(raw: unknown, context: RenderedContext): ParsedDraft {
  const text = typeof raw === "string" ? raw : String((raw as { text?: string })?.text ?? "");
  const payload = extractJson(text);
  if (!isObj(payload)) {
    throw new TemplateError("DRAFT_MALFORMED", "the model returned something that is not an object");
  }
  if (!Array.isArray(payload.bullets) || payload.bullets.length === 0) {
    throw new TemplateError("DRAFT_MALFORMED", "the draft carries no bullets, so it asserts nothing");
  }
  const allowed = new Set(context.allowed_ids);
  const backed = new Set(context.backed_ids);
  let offTemplate = 0;
  const bullets: DraftBullet[] = payload.bullets.map((b: unknown, i: number) => {
    if (!isObj(b)) throw new TemplateError("DRAFT_MALFORMED", `bullet ${i} is not an object`);
    const body = str(b.text);
    if (!body) throw new TemplateError("DRAFT_MALFORMED", `bullet ${i} has no text`);
    const group = SLOT_ROLES.has(norm(b.group)) ? norm(b.group) : "recap";
    const rawId = typeof b.claim_id === "string" && b.claim_id.trim() ? b.claim_id.trim() : null;
    // A BACKED claim the template never offered is still off contract for this
    // email. Drop the citation so the screen cuts the line and counts it. An id
    // the gate never passed is left exactly as the model wrote it, so the
    // screen sees it and rejects the whole draft.
    if (rawId && allowed.size && !allowed.has(rawId) && backed.has(rawId)) {
      offTemplate += 1;
      return { text: body, group, claim_id: null };
    }
    return { text: body, group, claim_id: rawId };
  });

  return {
    greeting: str(payload.greeting) || "Hi there,",
    opener: str(payload.opener),
    assurance: str(payload.close),
    signoff: str(payload.signoff) || "Best,",
    bullets,
    off_template_cut: offTemplate,
  };
}

/**
 * The body is assembled AFTER the screen, from what survived it, so a line the
 * screen cut cannot reappear in the prose a rep copies out.
 */
export function renderDraftBody(
  draft: Omit<ParsedDraft, "bullets">,
  bullets: Array<{ text: string; group: string }>,
): string {
  const lines: string[] = [draft.greeting, ""];
  if (draft.opener) lines.push(draft.opener, "");
  const outcome = bullets.find((b) => b.group === "outcome");
  if (outcome) lines.push(outcome.text, "");
  const recap = bullets.filter((b) => b.group === "recap");
  if (recap.length) {
    lines.push("What we covered:");
    for (const b of recap) lines.push(`- ${b.text}`);
    lines.push("");
  }
  const steps = bullets.filter((b) => b.group === "next_steps");
  if (steps.length) {
    lines.push("Next steps:");
    for (const b of steps) lines.push(`- ${b.text}`);
    lines.push("");
  }
  if (draft.assurance) lines.push(draft.assurance, "");
  lines.push(draft.signoff);
  return lines.join("\n");
}

// ── the whole path ──────────────────────────────────────────────────────────

export type Completion = { text: string; model?: string; source?: string };
export type CompleteFn = (
  prompt: ReturnType<typeof buildPrompt>,
  context: RenderedContext,
) => Promise<Completion>;

export type GenerateOptions = RenderOptions & {
  complete?: CompleteFn;
  tier?: LlmTier;
  signal?: AbortSignal;
};

export type GenerateResult =
  | {
      ok: false;
      reason: string;
      template_id: string | null;
      error?: string;
      considered: RouteTrace["considered"];
    }
  | {
      ok: true;
      template_id: string;
      email: RoutedFollowUpEmail;
      considered: RouteTrace["considered"];
    };

/**
 * Keyless fill of a routed template: chrome text + slot claim lines only.
 * Same screen path as a model draft, so an unbacked id still cannot ship.
 */
export function deterministicDraftFromContext(
  context: RenderedContext,
): ParsedDraft {
  let greeting = "Hi there,";
  let opener = "";
  let assurance = "";
  let signoff = "Best,";
  const bullets: DraftBullet[] = [];

  for (const block of context.blocks) {
    if (block.type === "text") {
      const role = norm(block.role);
      if (role === "greeting") greeting = block.text;
      else if (role === "opener") opener = block.text;
      else if (role === "assurance" || role === "cta" || role === "close") {
        assurance = block.text;
      } else if (role === "signoff") signoff = block.text;
      continue;
    }
    if (block.type !== "slot") continue;
    const group = SLOT_ROLES.has(norm(block.role)) ? norm(block.role) : "recap";
    for (const claim of block.claims) {
      bullets.push({ text: claim.text, group, claim_id: claim.id });
    }
  }

  if (!bullets.length) {
    throw new TemplateError(
      "DRAFT_MALFORMED",
      "the deterministic draft carries no bullets, so it asserts nothing",
    );
  }

  return {
    greeting,
    opener,
    assurance,
    signoff,
    bullets,
    off_template_cut: 0,
  };
}

async function callTier(
  tier: LlmTier,
  prompt: ReturnType<typeof buildPrompt>,
  signal?: AbortSignal,
): Promise<Completion> {
  if (tier.source === "offline") throw new LlmNotConfiguredError();
  // One chat call for the whole app (src/lib/llm.ts). The tier rides in as an
  // explicit target because the local Ollama rung is keyless and resolveLlm()
  // cannot describe it.
  const text = await chatText({
    system: prompt.system,
    user: prompt.user,
    temperature: 0,
    target: {
      baseUrl: tier.baseUrl,
      apiKey: tier.apiKey,
      model: tier.model,
      label: tier.source === "ollama-local" ? `local Ollama · ${tier.model}` : tier.model,
      source: tier.source,
    },
    signal,
  });
  return { text, model: tier.model, source: tier.source };
}

/**
 * route, render, model, parse, screen. Every failure below the routing step
 * returns a NAMED reason instead of throwing, because the honest answer to a
 * broken generation is the deterministic baseline email on its own, never a
 * half rendered panel. The one thing that never degrades quietly: a draft
 * citing an id the gate did not pass is rejected whole, and the reason says so.
 */
export async function generateTemplateEmail(
  notes: DealNotes,
  templates: unknown[] | null | undefined,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  let template: Template | null = null;
  let considered: RouteTrace["considered"] = [];
  try {
    ({ template, considered } = routeWithTrace(notes, templates, opts));
  } catch (err) {
    if (
      err instanceof TemplateError &&
      err.code === "TEMPLATE_NOT_FOUND"
    ) {
      return {
        ok: false,
        reason: "template_not_found",
        template_id: opts.templateId?.trim() || null,
        error: err.message,
        considered: [],
      };
    }
    throw err;
  }
  if (!template) {
    return { ok: false, reason: "no_template_routed", template_id: null, considered };
  }

  const context = renderContext(notes, template, opts);
  if (!context.claims.length) {
    return {
      ok: false,
      reason: "no_backed_claims_for_template",
      template_id: template.id,
      considered,
    };
  }

  const prompt = buildPrompt(context);
  const tier = opts.tier ?? (await resolveLlmTier());
  const complete: CompleteFn | undefined =
    opts.complete ??
    (tier.source === "offline"
      ? undefined
      : (p) => callTier(tier, p, opts.signal));

  let draft: ParsedDraft | null = null;
  let completion: Completion;

  if (!complete) {
    // No model tier: still ship the template that routed, filled only with
    // gate-passed slot claims. The page keeps a second email variant without
    // inventing prose a model never wrote.
    try {
      draft = deterministicDraftFromContext(context);
    } catch (err) {
      return {
        ok: false,
        reason: "draft_malformed",
        template_id: template.id,
        error: (err as Error).message,
        considered,
      };
    }
    completion = {
      text: "",
      model: "template (deterministic)",
      source: "deterministic",
    };
  } else {
    try {
      completion = await complete(prompt, context);
    } catch (err) {
      const noTier =
        err instanceof LlmNotConfiguredError ||
        (err as Error)?.name === "LLM_NOT_CONFIGURED";
      if (noTier) {
        try {
          draft = deterministicDraftFromContext(context);
          completion = {
            text: "",
            model: "template (deterministic)",
            source: "deterministic",
          };
        } catch (fallbackErr) {
          return {
            ok: false,
            reason: "no_llm_tier",
            template_id: template.id,
            error: (fallbackErr as Error).message,
            considered,
          };
        }
      } else {
        return {
          ok: false,
          reason: "llm_call_failed",
          template_id: template.id,
          error: (err as Error).message,
          considered,
        };
      }
    }

    if (!draft) {
      try {
        draft = parseDraft(completion, context);
      } catch (err) {
        const reason =
          (err as TemplateError).code === "DRAFT_UNPARSEABLE"
            ? "draft_unparseable"
            : "draft_malformed";
        return {
          ok: false,
          reason,
          template_id: template.id,
          error: (err as Error).message,
          considered,
        };
      }
    }
  }

  let screened: { bullets: Array<{ text: string; claimId: string }>; cut: number };
  try {
    screened = screenDraft(
      {
        bullets: draft.bullets.map((b) => ({
          text: b.text,
          claim_id: b.claim_id ?? undefined,
        })),
      },
      context.screen_claims,
    );
  } catch (err) {
    if (err instanceof EmailError) {
      return {
        ok: false,
        reason: "draft_rejected_unknown_citation",
        template_id: template.id,
        error: err.message,
        considered,
      };
    }
    throw err;
  }
  if (!screened.bullets.length) {
    return {
      ok: false,
      reason: "draft_empty_after_screen",
      template_id: template.id,
      considered,
    };
  }

  // The screen owns which bullets live. All that happens here is recovering
  // the group each surviving bullet was written for, by walking the parsed
  // bullets in the same order the screen kept them.
  let cursor = 0;
  const kept = screened.bullets.map((b) => {
    while (cursor < draft.bullets.length && draft.bullets[cursor]!.claim_id !== b.claimId) {
      cursor += 1;
    }
    const group = draft.bullets[cursor]?.group ?? "recap";
    cursor += 1;
    return { text: b.text, claimId: b.claimId, group };
  });

  const body = renderDraftBody(draft, kept);
  // The source rides along on the completion, never guessed here. Only the
  // local tier gets a suffix: the model name alone ("llama3.2") reads as a
  // hosted model unless the panel says where it actually ran.
  const source = completion.source ?? "configured";
  const rawModel = completion.model || (tier.source === "offline" ? "unknown" : tier.model);
  const model = source === "ollama-local" ? `${rawModel} via local Ollama` : rawModel;

  return {
    ok: true,
    template_id: template.id,
    considered,
    email: {
      // The template file owns the subject. The model's suggestion is read and
      // dropped: an ungated string never rides onto an envelope.
      subject: template.subject,
      body,
      bullets: kept.map((b) => ({ text: b.text, claimId: b.claimId })),
      template: {
        id: template.id,
        version: template.version,
        title: template.title,
        short: template.short,
        explainer: template.panel.explainer,
      },
      provenance: {
        model,
        source,
        cut: screened.cut,
        offTemplateCut: draft.off_template_cut,
      },
    },
  };
}

/**
 * The wiring entry point: try the library on one gated set of notes, and hand
 * back a second email variant only when everything held. Anything else returns
 * null, and null leaves the page exactly as it is today.
 */
export async function generateRoutedFollowUp(
  notes: DealNotes,
  opts: GenerateOptions = {},
): Promise<RoutedFollowUpEmail | null> {
  try {
    const tier = opts.tier ?? (await resolveLlmTier());
    const result = await generateTemplateEmail(notes, TEMPLATE_FILES, {
      ...opts,
      tier,
    });
    return result.ok ? result.email : null;
  } catch (err) {
    // Unknown forced id is the caller's mistake — surface it. Everything else
    // stays an optional extra that must not take the run down.
    if (err instanceof TemplateError && err.code === "TEMPLATE_NOT_FOUND") {
      throw err;
    }
    return null;
  }
}
