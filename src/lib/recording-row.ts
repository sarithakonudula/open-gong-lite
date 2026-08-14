// One derivation for every list surface: Recordings table, Companies
// clusters, and notification events all read the same row shape.

import {
  buildSampleCompanyIndex,
  companyForRun,
  SampleCompanyIndex,
} from "@/lib/company";
import { computeMomentum } from "@/lib/momentum";
import {
  applyMethodologyVerdict,
  demoScorecardForRun,
  getMethodologyPack,
} from "@/lib/methodology";
import { callSentiment, DealStateLabel } from "@/lib/sentiment";
import { deriveTopics, TopicTag } from "@/lib/topics";
import {
  isEmailableStatus,
  RunRecord,
  RunStatus,
  SampleCall,
} from "@/lib/types";

export type ScoreSource = "scorecard" | "momentum" | "coverage";

export type RecordingRow = {
  id: string;
  title: string;
  company: string;
  createdAt: string;
  durationMs: number | null;
  pullQuote: string | null;
  topics: TopicTag[];
  score: number | null;
  scoreSource: ScoreSource | null;
  dealState: DealStateLabel | null;
  sentimentPct: number | null;
  status: RunStatus;
  source: RunRecord["source"];
  sourceLabel: string;
};

export function buildRowContext(samples: SampleCall[]): SampleCompanyIndex {
  return buildSampleCompanyIndex(samples);
}

/** Methodology score if one is stored (LLM-scored or sample demo verdict). */
function scorecardScore(
  run: RunRecord,
  index?: SampleCompanyIndex,
): number | null {
  if (run.methodology?.verdict) {
    try {
      const pack = getMethodologyPack(run.methodology.packId);
      if (pack) {
        const card = applyMethodologyVerdict(
          pack,
          run.transcript,
          run.methodology.verdict,
          { dealValueUsd: run.methodology.dealValueUsd ?? undefined },
        );
        if (card) return card.score;
      }
    } catch {
      // Stored verdict didn't re-gate — fall through to momentum.
    }
  }
  try {
    const demo = demoScorecardForRun(run, index?.titleToSlug);
    if (demo) return demo.score;
  } catch {
    // No demo verdict for this run.
  }
  return null;
}

export function callScore(
  run: RunRecord,
  index?: SampleCompanyIndex,
): { score: number | null; source: ScoreSource | null } {
  const scorecard = scorecardScore(run, index);
  if (scorecard != null) return { score: scorecard, source: "scorecard" };
  if (run.notes) {
    return { score: computeMomentum(run.notes).score, source: "momentum" };
  }
  return { score: null, source: null };
}

function pullQuote(run: RunRecord): string | null {
  const claims = [
    ...(run.notes?.summary ?? []),
    ...(run.notes?.intent ?? []),
    ...(run.notes?.nextSteps ?? []),
  ];
  const verified = claims.find(
    (c) => isEmailableStatus(c.status) && c.evidence?.quote,
  );
  return verified?.evidence.quote ?? claims[0]?.text ?? null;
}

function durationMs(run: RunRecord): number | null {
  for (let i = run.transcript.length - 1; i >= 0; i--) {
    const line = run.transcript[i];
    if (line.endMs != null) return line.endMs;
    if (line.startMs != null) return line.startMs;
  }
  return null;
}

export { formatDuration } from "@/lib/format";

export function toRecordingRow(
  run: RunRecord,
  index?: SampleCompanyIndex,
): RecordingRow {
  const { score, source } = callScore(run, index);
  const sentiment = run.notes ? callSentiment(run.notes) : null;
  return {
    id: run.id,
    title: run.notes?.title || run.sourceLabel,
    company: companyForRun(run, index),
    createdAt: run.createdAt,
    durationMs: durationMs(run),
    pullQuote: pullQuote(run),
    topics: run.notes ? deriveTopics(run.notes) : [],
    score,
    scoreSource: source,
    dealState: sentiment?.state ?? null,
    sentimentPct: sentiment?.pct ?? null,
    status: run.status,
    source: run.source,
    sourceLabel: run.sourceLabel,
  };
}
