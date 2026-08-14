import type { Claim, ClaimStatus, RunNotes } from "@/lib/types";

export const BADGE_CLASS: Record<ClaimStatus, string> = {
  verified: "badge-verified",
  segment_corrected: "badge-corrected",
  uncorroborated: "badge-unproven",
  blocked_injection: "badge-blocked",
};

export function claimStatus(claim: Claim): ClaimStatus {
  return claim.status ?? "verified";
}

export function collectClaims(notes: RunNotes | null): Claim[] {
  if (!notes) return [];
  return [
    ...notes.summary,
    ...notes.objections,
    ...notes.intent,
    ...notes.nextSteps,
    ...(notes.pain || []),
    ...(notes.pricing || []),
    ...(notes.competitors || []),
  ];
}
