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

export function emailableClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => isEmailableStatus(c.status));
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
