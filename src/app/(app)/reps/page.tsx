import { RepCard, RepsClient } from "@/components/reps/RepsClient";
import {
  buildRepProfile,
  CoachingInput,
  detectRepSpeaker,
  RepCoachingProfile,
} from "@/lib/coaching";
import {
  applyMethodologyVerdict,
  demoScorecardForRun,
  getMethodologyPack,
} from "@/lib/methodology";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reps — OpenGong Lite" };

/** Same scorecard-collection loop as GET /api/coach, without persistence. */
async function buildProfiles(): Promise<RepCoachingProfile[]> {
  const runs = await listFullRuns(200);
  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));

  const byRep = new Map<string, CoachingInput[]>();
  const displayName = new Map<string, string>();
  for (const run of runs) {
    if (run.transcript.length === 0) continue;

    let card = null;
    if (run.methodology) {
      const pack = getMethodologyPack(run.methodology.packId);
      if (pack) {
        try {
          card = applyMethodologyVerdict(
            pack,
            run.transcript,
            run.methodology.verdict,
            { dealValueUsd: run.methodology.dealValueUsd },
          );
        } catch {
          card = null;
        }
      }
    }
    if (!card) card = demoScorecardForRun(run, titleToSlug);
    if (!card) continue;

    const rep = detectRepSpeaker(run.transcript);
    if (!rep) continue;
    const key = rep.trim().toLowerCase();
    if (!displayName.has(key)) displayName.set(key, rep.trim());
    byRep.set(key, [
      ...(byRep.get(key) ?? []),
      {
        runId: run.id,
        at: run.createdAt,
        title: run.notes?.title ?? run.sourceLabel,
        card,
      },
    ]);
  }

  const profiles: RepCoachingProfile[] = [];
  for (const [key, inputs] of byRep) {
    profiles.push(buildRepProfile(displayName.get(key) ?? key, inputs));
  }
  profiles.sort((a, b) => b.calls.length - a.calls.length);
  return profiles;
}

function toCard(profile: RepCoachingProfile): RepCard {
  const latest = profile.calls[profile.calls.length - 1];
  const strength = profile.strengths[0] ?? null;
  const focus = profile.focus[0] ?? null;
  const drill =
    (focus && profile.drills.find((d) => d.traitId === focus.traitId)) ||
    profile.drills[0] ||
    null;

  return {
    rep: profile.rep,
    callCount: profile.calls.length,
    latestScore: latest?.score ?? null,
    scoreTrend: profile.scoreTrend,
    strength: strength
      ? {
          name: strength.name,
          detail:
            strength.avg != null
              ? `Averaging ${strength.avg.toFixed(1)}/3 across scored calls.`
              : "Consistently strong across scored calls.",
        }
      : null,
    improvement: focus
      ? {
          name: focus.name,
          priority:
            focus.status === "gap"
              ? "High priority"
              : focus.status === "developing"
                ? "Medium priority"
                : "Low priority",
          priorityClass:
            focus.status === "gap"
              ? "chip-risk"
              : focus.status === "developing"
                ? "chip-warn"
                : "chip-positive",
          tip: drill?.nextMove ?? null,
          yourMoment: drill?.yourMoment ?? null,
        }
      : null,
    traits: profile.traits.map((t) => ({
      traitId: t.traitId,
      name: t.name,
      history: t.history,
      avg: t.avg,
      trend: t.trend,
      status: t.status,
    })),
  };
}

export default async function RepsPage() {
  const profiles = await buildProfiles();
  const cards = profiles.map(toCard);

  const asks: Array<{ label: string; answer: string }> = [];
  if (cards.length > 0) {
    const needsCoaching = [...cards]
      .filter((c) => c.latestScore != null)
      .sort((a, b) => (a.latestScore ?? 0) - (b.latestScore ?? 0))[0];
    if (needsCoaching) {
      asks.push({
        label: "Who needs coaching this week?",
        answer: `${needsCoaching.rep} — latest score ${needsCoaching.latestScore}%${
          needsCoaching.improvement
            ? `, focus on ${needsCoaching.improvement.name.toLowerCase()}`
            : ""
        }.`,
      });
    }
    const improved = [...cards]
      .filter((c) => c.scoreTrend != null && c.scoreTrend > 0)
      .sort((a, b) => (b.scoreTrend ?? 0) - (a.scoreTrend ?? 0))[0];
    asks.push({
      label: "Who's improved the most?",
      answer: improved
        ? `${improved.rep} — score up ${improved.scoreTrend} point${improved.scoreTrend === 1 ? "" : "s"} since their previous scored call.`
        : "No rep has more than one scored call yet, so there is no trend to compare.",
    });
    const busiest = [...cards].sort((a, b) => b.callCount - a.callCount)[0];
    if (busiest) {
      asks.push({
        label: "Who ran the most calls?",
        answer: `${busiest.rep} — ${busiest.callCount} scored call${busiest.callCount === 1 ? "" : "s"}.`,
      });
    }
  }

  return <RepsClient cards={cards} asks={asks} />;
}
