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
      "email composer accepts an array of claims only — never a transcript",
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
    `Thanks for ${title} — recapping what we actually discussed:`,
    "",
    ...bullets.map((b) => `- ${b.text}`),
    "",
    "Every point above is tied to a verified line in the call notes. Unproven claims were not included.",
    "",
    "— OpenGong Lite",
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
        `draft cites claim ${JSON.stringify(claimId)} which is not a verified claim — whole draft rejected`,
      );
    }
    kept.push({ text: String(bullet.text || ""), claimId });
  }
  return { bullets: kept, cut };
}

/**
 * Keep a curated/Recap email only when its receipt passed the gate.
 * Otherwise draft from verified claims, or withhold if none passed.
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

  if (isEmailableStatus(opts.emailStatus)) {
    return { ...opts.existing, status: opts.emailStatus };
  }

  const usable = emailableClaims(opts.claims);
  if (usable.length === 0) {
    return {
      subject: `Follow-up withheld: ${opts.title}`.slice(0, 160),
      body: "No claims passed the receipts gate, so OpenGong Lite did not draft a customer email. Unproven or injected lines never leave this page.",
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
