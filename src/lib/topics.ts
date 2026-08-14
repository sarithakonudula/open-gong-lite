// Topic tags for the Recordings list and Call Insights rail.
//
// Deterministic, derived only from gate-passed claims (never raw model text):
// section presence first, then a keyword scan over corroborated claim texts
// and their verified quotes. Same call → same tags, no LLM.

import { Claim, DealNotes, isEmailableStatus } from "@/lib/types";

export type TopicTag =
  | "pricing"
  | "competitor"
  | "high intent"
  | "next steps"
  | "budget"
  | "timeline"
  | "demo"
  | "follow up"
  | "objection";

const MAX_TAGS = 5;

function corroborated(claims: Claim[] | undefined): Claim[] {
  return (claims ?? []).filter((c) => isEmailableStatus(c.status));
}

function textPool(claims: Claim[]): string {
  return claims
    .map((c) => `${c.text} ${c.evidence?.quote ?? ""}`)
    .join(" ")
    .toLowerCase();
}

export function deriveTopics(notes: DealNotes): TopicTag[] {
  const tags: TopicTag[] = [];
  const push = (tag: TopicTag) => {
    if (!tags.includes(tag) && tags.length < MAX_TAGS) tags.push(tag);
  };

  const pricing = corroborated(notes.pricing);
  const competitors = corroborated(notes.competitors);
  const intent = corroborated(notes.intent);
  const nextSteps = corroborated(notes.nextSteps);
  const objections = corroborated(notes.objections);
  const all = [
    ...corroborated(notes.summary),
    ...objections,
    ...intent,
    ...nextSteps,
    ...pricing,
    ...competitors,
    ...corroborated(notes.pain),
  ];
  const pool = textPool(all);

  if (pricing.length > 0 || /\bpricing|price|quote[sd]?\b/.test(pool)) {
    push("pricing");
  }
  if (competitors.length > 0) push("competitor");
  if (intent.length > 0) push("high intent");
  if (nextSteps.length > 0) push("next steps");
  if (/\bbudget|spend|afford/.test(pool)) push("budget");
  if (/\btimeline|deadline|by (q[1-4]|end of|next (week|month|quarter))/.test(pool)) {
    push("timeline");
  }
  if (/\bdemo|walk.?through|trial\b/.test(pool)) push("demo");
  if (
    notes.followUpEmail?.status != null ||
    /\bfollow.?up|send (over|through|across)|circulate/.test(pool)
  ) {
    push("follow up");
  }
  if (objections.length > 0) push("objection");

  return tags;
}
