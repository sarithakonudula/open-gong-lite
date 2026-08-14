import { isCategoryNote } from "@/lib/note-text";
import {
  Claim,
  ClaimStatus,
  FollowUpEmail,
  isEmailableStatus,
  TranscriptLine,
} from "@/lib/types";

export class EmailError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export type EmailBullet = { text: string; claimId: string };

function assertClaimsOnly(claims: unknown): asserts claims is Claim[] {
  if (!Array.isArray(claims)) {
    throw new EmailError(
      "EMAIL_INPUT_INVALID",
      "email composer accepts an array of claims only, never a transcript",
    );
  }
}

/**
 * What may become a line in an outbound email.
 *
 * Two conditions, and both are hard. The claim has to have passed the gate,
 * and it has to say something about this call. The second one is here because
 * of a real draft: when the keyword extractor read a call it could not
 * summarize, every template line it emitted verified trivially, and the email
 * went out as six bullets of "X came up on the call" under the sentence
 * "Every point above is backed by a line in the call." True, and unsendable.
 */
export function emailableClaims(claims: Claim[]): Claim[] {
  return claims.filter(
    (c) => isEmailableStatus(c.status) && !isCategoryNote(c.text),
  );
}

/** Deterministic draft from gate-passed claims only. Never sees the transcript. */
export function composeEmail(
  claims: Claim[],
  opts: { title?: string } = {},
): { subject: string; body: string; bullets: EmailBullet[] } {
  assertClaimsOnly(claims);
  const title = opts.title || "our call";
  const bullets = emailableClaims(claims).map((c) => ({
    text: c.text,
    claimId: c.id || c.evidence.lineId,
  }));
  const body = [
    `Thanks for ${title}. Recapping what we actually discussed:`,
    "",
    ...bullets.map((b) => `- ${b.text}`),
    "",
    "Every point above is backed by a line in the call. Anything we could not find in the call was left out.",
    "",
    "OpenGong Lite",
  ].join("\n");
  return { subject: `Follow-up: ${title}`, body, bullets };
}

export function screenDraft(
  draft: { bullets?: Array<{ text?: string; claimId?: string; claim_id?: string }> },
  claims: Claim[],
): { bullets: EmailBullet[]; cut: number } {
  assertClaimsOnly(claims);
  const allowed = new Set(
    emailableClaims(claims).map((c) => c.id || c.evidence.lineId),
  );
  const kept: EmailBullet[] = [];
  let cut = 0;
  for (const bullet of draft.bullets ?? []) {
    const claimId = bullet.claimId ?? bullet.claim_id;
    if (claimId == null) {
      cut += 1;
      continue;
    }
    if (!allowed.has(claimId)) {
      throw new EmailError(
        "EMAIL_DRAFT_REJECTED",
        `the draft cites ${JSON.stringify(claimId)}, which is not a backed note, so the whole draft was rejected`,
      );
    }
    kept.push({ text: String(bullet.text || ""), claimId });
  }
  return { bullets: kept, cut };
}

/**
 * The follow-up email is ALWAYS composed from claims that passed the gate,
 * or withheld when none did. A model- or Recap-authored body never ships,
 * even when its own receipt passed: one verified receipt on the envelope
 * must not launder an unverified body past the choke point. (The old
 * early-return that kept a "curated" body when opts.emailStatus passed was
 * exactly that laundering path — a fabricated Recap email shipped verbatim
 * because its single self-assigned quote matched a transcript line.)
 */
export function chokeFollowUp(opts: {
  title: string;
  existing: FollowUpEmail;
  emailStatus: ClaimStatus;
  claims: Claim[];
  transcript: TranscriptLine[];
}): FollowUpEmail {
  const fallbackLine = opts.transcript[0];
  if (!fallbackLine) {
    throw new EmailError("EMAIL_INPUT_INVALID", "empty transcript");
  }

  const usable = emailableClaims(opts.claims);
  if (usable.length === 0) {
    return {
      subject: `Follow-up withheld: ${opts.title}`.slice(0, 160),
      body: "Nothing in these notes could be backed by a line in the call, so OpenGong Lite did not draft an email. A note we cannot back never leaves the page, and neither does a line that tried to give the AI instructions.",
      evidence: {
        lineId: fallbackLine.id,
        quote:
          fallbackLine.text.length > 90
            ? `${fallbackLine.text.slice(0, 87)}...`
            : fallbackLine.text,
      },
      status: "uncorroborated",
    };
  }

  const drafted = composeEmail(usable, { title: opts.title });
  const receipt = usable[0]!;
  return {
    subject: drafted.subject.slice(0, 160),
    body: drafted.body,
    evidence: receipt.evidence,
    status: receipt.status || "verified",
  };
}

// ── Contextual follow-up (LLM + CRM context, same choke) ────────────────────
//
// The model NEVER sees the transcript or any non-emailable claim — only
// verified/segment-corrected claims plus CRM facts. Output is post-gated:
// every cited claim id must be emailable, and a leak screen rejects any draft
// whose text contains an unproven or injected claim. On any failure callers
// fall back to the deterministic composeEmail.

export type CrmEmailContext = {
  company?: string;
  contactFirstName?: string;
  dealStage?: string;
  /** Short CRM facts, e.g. "Viewed /pricing 3x this week". */
  recentActivity?: string[];
};

export type ContextualDraft = {
  subject: string;
  body: string;
  usedClaimIds: string[];
  source: "llm_crm";
};

type ChatFn = (args: { system: string; user: string }) => Promise<string>;

function normalizeForLeakScan(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Throws EmailError when a non-emailable claim's text/quote appears in the draft. */
export function screenContextualLeak(
  draft: { subject: string; body: string },
  claims: Claim[],
): void {
  const haystack = normalizeForLeakScan(`${draft.subject}\n${draft.body}`);
  for (const claim of claims) {
    if (isEmailableStatus(claim.status)) continue;
    for (const fragment of [claim.text, claim.evidence.quote]) {
      const needle = normalizeForLeakScan(fragment);
      if (needle.length >= 12 && haystack.includes(needle)) {
        throw new EmailError(
          "EMAIL_LEAK_BLOCKED",
          `draft contains a ${claim.status ?? "ungated"} claim — whole draft rejected`,
        );
      }
    }
  }
}

export async function composeContextualEmail(opts: {
  claims: Claim[];
  title: string;
  context?: CrmEmailContext;
  chat: ChatFn;
  guidance?: string;
}): Promise<ContextualDraft> {
  assertClaimsOnly(opts.claims);
  const usable = emailableClaims(opts.claims);
  if (usable.length === 0) {
    throw new EmailError(
      "EMAIL_NO_VERIFIED_CLAIMS",
      "no claims passed the receipts gate — nothing to draft from",
    );
  }

  const allowed = new Map(
    usable.map((c) => [c.id || c.evidence.lineId, c] as const),
  );
  const claimBlock = [...allowed.entries()]
    .map(([id, c]) => `- [${id}] ${c.text}`)
    .join("\n");
  const ctx = opts.context ?? {};
  const contextBlock = [
    ctx.company ? `Company: ${ctx.company}` : null,
    ctx.contactFirstName ? `Contact first name: ${ctx.contactFirstName}` : null,
    ctx.dealStage ? `Deal stage: ${ctx.dealStage}` : null,
    ...(ctx.recentActivity ?? []).map((a) => `Recent: ${a}`),
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You draft a short follow-up email for a sales rep after a call.
Return ONLY valid JSON: {"subject": string, "body": string, "usedClaimIds": string[]}
Rules:
- You may ONLY state facts from the VERIFIED CLAIMS and CRM CONTEXT below.
- List every claim id you used in usedClaimIds. Use at least one.
- Never invent numbers, dates, discounts, or commitments.
- Warm, concrete, under 160 words. Reference CRM context naturally when it helps.
${opts.guidance ? `Admin guidance:\n${opts.guidance}` : ""}`;

  const user = `Call: ${opts.title}
${contextBlock ? `CRM CONTEXT:\n${contextBlock}\n` : ""}VERIFIED CLAIMS:\n${claimBlock}`;

  const raw = await opts.chat({ system, user });
  let parsed: { subject?: unknown; body?: unknown; usedClaimIds?: unknown };
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(cleaned) as typeof parsed;
  } catch {
    throw new EmailError("EMAIL_DRAFT_INVALID", "LLM draft was not valid JSON");
  }

  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const usedClaimIds = Array.isArray(parsed.usedClaimIds)
    ? parsed.usedClaimIds.map(String)
    : [];
  if (!subject || !body || usedClaimIds.length === 0) {
    throw new EmailError(
      "EMAIL_DRAFT_INVALID",
      "LLM draft is missing subject, body, or claim citations",
    );
  }
  for (const id of usedClaimIds) {
    if (!allowed.has(id)) {
      throw new EmailError(
        "EMAIL_DRAFT_REJECTED",
        `draft cites claim ${JSON.stringify(id)} which is not a verified claim — whole draft rejected`,
      );
    }
  }
  screenContextualLeak({ subject, body }, opts.claims);

  return {
    subject: subject.slice(0, 160),
    body,
    usedClaimIds,
    source: "llm_crm",
  };
}
