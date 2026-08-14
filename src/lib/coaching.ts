// Rep training loop — personalized coaching built from methodology
// scorecards across a rep's calls.
//
// Personalization here is grounded, not generated: each drill pairs the
// pack's own coaching content (why_it_matters / next_move / example_line)
// with the REP'S OWN gate-passed quotes from their calls — "what you said"
// vs "what mastery sounds like". An optional LLM narrative can sit on top,
// but the drills themselves never hallucinate.

import { promises as fs } from "fs";
import path from "path";
import { config } from "@/lib/config";
import {
  MethodologyScorecard,
  ScoredTrait,
} from "@/lib/methodology";
import { TranscriptLine } from "@/lib/types";

export type CoachingInput = {
  runId: string;
  at: string;
  title: string;
  card: MethodologyScorecard;
};

export type TraitProgress = {
  traitId: string;
  name: string;
  /** 0-3 depth points per call, oldest → newest (null = unscored that call). */
  history: Array<number | null>;
  avg: number | null;
  /** Latest minus previous scored value; null with fewer than 2 data points. */
  trend: number | null;
  status: "strength" | "developing" | "gap";
};

export type CoachingDrill = {
  traitId: string;
  name: string;
  whyItMatters: string;
  nextMove: string;
  exampleLine: string;
  /** The rep's own moment, through the gate — receipts, not vibes. */
  yourMoment: { quote: string; lineId: string; runId: string } | null;
  gap: string | null;
};

export type RepCoachingProfile = {
  schema: "opengong.coaching-profile";
  version: 1;
  rep: string;
  generatedAt: string;
  calls: Array<{ runId: string; at: string; title: string; score: number }>;
  scoreTrend: number | null;
  traits: TraitProgress[];
  strengths: TraitProgress[];
  focus: TraitProgress[];
  drills: CoachingDrill[];
};

/**
 * The rep is the speaker doing seller work: proposing, demoing, asking.
 * Priority order:
 * 1. An explicit seller label ("Rep", "AE", "SDR", …) — live-call
 *    transcripts from hear-speakers label diarized speakers exactly "Rep".
 * 2. Seller-language score, tie-broken by word count (a talkative buyer who
 *    asks questions no longer outranks a rep with real seller markers).
 */
export function detectRepSpeaker(transcript: TranscriptLine[]): string | null {
  if (transcript.length === 0) return null;

  const REP_LABEL = /^(rep|sales(person)?|ae|account exec(utive)?|sdr|bdr|seller|agent)$/i;
  for (const line of transcript) {
    if (REP_LABEL.test(line.speaker.trim())) return line.speaker;
  }

  const SELLER_MARKERS =
    /\b(i'?ll send|let me|we can|our (platform|product|team|customers)|walk you through|pricing works|book(ing)? a demo|next step|proposal|onboard)\b/i;
  const scores = new Map<string, number>();
  const words = new Map<string, number>();
  for (const line of transcript) {
    let score = scores.get(line.speaker) ?? 0;
    if (SELLER_MARKERS.test(line.text)) score += 3;
    score += (line.text.match(/\?/g) ?? []).length;
    scores.set(line.speaker, score);
    words.set(
      line.speaker,
      (words.get(line.speaker) ?? 0) + line.text.split(/\s+/).length,
    );
  }
  let best: string | null = null;
  let bestScore = -1;
  let bestWords = -1;
  for (const [speaker, score] of scores) {
    const w = words.get(speaker) ?? 0;
    if (score > bestScore || (score === bestScore && w > bestWords)) {
      best = speaker;
      bestScore = score;
      bestWords = w;
    }
  }
  return best;
}

function scoredPoints(t: ScoredTrait): number | null {
  return t.inScope ? t.points : null;
}

export function buildRepProfile(
  rep: string,
  inputs: CoachingInput[],
  opts: { now?: string } = {},
): RepCoachingProfile {
  const ordered = [...inputs].sort((a, b) => a.at.localeCompare(b.at));
  const generatedAt = opts.now ?? new Date().toISOString();

  // Union of traits across all cards (packs can differ between calls).
  const traitMeta = new Map<string, { name: string }>();
  for (const input of ordered) {
    for (const t of input.card.traits) {
      if (!traitMeta.has(t.trait.id)) traitMeta.set(t.trait.id, { name: t.trait.name });
    }
  }

  const traits: TraitProgress[] = [...traitMeta.entries()].map(([traitId, meta]) => {
    const history = ordered.map((input) => {
      const hit = input.card.traits.find((t) => t.trait.id === traitId);
      return hit ? scoredPoints(hit) : null;
    });
    const scored = history.filter((p): p is number => p != null);
    const avg =
      scored.length === 0
        ? null
        : Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100;
    const trend =
      scored.length >= 2 ? scored[scored.length - 1]! - scored[scored.length - 2]! : null;
    const status: TraitProgress["status"] =
      avg == null || avg < 1 ? "gap" : avg < 2.25 ? "developing" : "strength";
    return { traitId, name: meta.name, history, avg, trend, status };
  });

  const scoredTraits = traits.filter((t) => t.avg != null);
  const focus = [...scoredTraits]
    .sort((a, b) => a.avg! - b.avg! || (a.trend ?? 0) - (b.trend ?? 0))
    .slice(0, 3);
  const strengths = [...scoredTraits]
    .sort((a, b) => b.avg! - a.avg!)
    .filter((t) => t.status === "strength")
    .slice(0, 2);

  // Drills: pack coaching content + the rep's own latest gated moment.
  const drills: CoachingDrill[] = focus.map((progress) => {
    let latest: { trait: ScoredTrait; runId: string } | null = null;
    for (const input of ordered) {
      const hit = input.card.traits.find((t) => t.trait.id === progress.traitId);
      if (hit) latest = { trait: hit, runId: input.runId };
    }
    const trait = latest!.trait;
    const evidence = trait.verdict?.gatedEvidence.find(
      (e) => e.status !== "uncorroborated",
    );
    return {
      traitId: progress.traitId,
      name: progress.name,
      whyItMatters: trait.trait.coaching.why_it_matters,
      nextMove: trait.trait.coaching.next_move,
      exampleLine: trait.trait.coaching.example_line,
      yourMoment: evidence
        ? { quote: evidence.quote, lineId: evidence.lineId, runId: latest!.runId }
        : null,
      gap: trait.verdict?.gap || null,
    };
  });

  const calls = ordered.map((input) => ({
    runId: input.runId,
    at: input.at,
    title: input.title,
    score: input.card.score,
  }));
  const scoreTrend =
    calls.length >= 2
      ? calls[calls.length - 1]!.score - calls[calls.length - 2]!.score
      : null;

  return {
    schema: "opengong.coaching-profile",
    version: 1,
    rep,
    generatedAt,
    calls,
    scoreTrend,
    traits,
    strengths,
    focus,
    drills,
  };
}

export function renderCoachingPlan(profile: RepCoachingProfile): string {
  const lines: string[] = [];
  lines.push(`# Coaching plan — ${profile.rep}`);
  lines.push("");
  const latest = profile.calls[profile.calls.length - 1];
  lines.push(
    `${profile.calls.length} scored call${profile.calls.length === 1 ? "" : "s"}` +
      (latest ? ` · latest ${latest.score}/100` : "") +
      (profile.scoreTrend != null
        ? ` · trend ${profile.scoreTrend >= 0 ? "+" : ""}${profile.scoreTrend}`
        : ""),
  );
  if (profile.strengths.length > 0) {
    lines.push("");
    lines.push(
      `**Keep doing:** ${profile.strengths.map((s) => s.name).join(" · ")}`,
    );
  }
  for (const drill of profile.drills) {
    lines.push("");
    lines.push(`## Focus: ${drill.name}`);
    lines.push(`Why it matters: ${drill.whyItMatters}`);
    if (drill.gap) lines.push(`This call's gap: ${drill.gap}`);
    if (drill.yourMoment) {
      lines.push(
        `What you said: "${drill.yourMoment.quote}" [${drill.yourMoment.lineId}]`,
      );
    }
    lines.push(`Next move: ${drill.nextMove}`);
    lines.push(`What mastery sounds like: "${drill.exampleLine}"`);
  }
  return lines.join("\n");
}

// ── Persistence (one profile file per rep) ──────────────────────────────────

function coachingDir(): string {
  return path.join(config.dataDir, "coaching");
}

export function repSlug(rep: string): string {
  return (
    rep
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "rep"
  );
}

export async function saveRepProfile(
  profile: RepCoachingProfile,
): Promise<void> {
  await fs.mkdir(coachingDir(), { recursive: true });
  await fs.writeFile(
    path.join(coachingDir(), `${repSlug(profile.rep)}.json`),
    JSON.stringify(profile, null, 2),
    "utf8",
  );
}
