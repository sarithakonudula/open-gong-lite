import {
  CompaniesClient,
  CompanyCluster,
} from "@/components/companies/CompaniesClient";
import { KIND_LABEL } from "@/lib/call-kind";
import {
  buildSampleCompanyIndex,
  companyForRun,
  normalizeCompanyKey,
} from "@/lib/company";
import { demoSignalFeedForRun, DealSignalFeed } from "@/lib/deal-signals";
import { buildDigestEntries, digestTotals } from "@/lib/digest";
import { toRecordingRow } from "@/lib/recording-row";
import { listSamples } from "@/lib/samples";
import { dealState } from "@/lib/sentiment";
import { listFullRuns } from "@/lib/store";
import type { RunRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Companies — OpenGong Lite" };

export default async function CompaniesPage() {
  const [runs, samples] = await Promise.all([listFullRuns(200), listSamples()]);
  const index = buildSampleCompanyIndex(samples);
  const forRun = (run: RunRecord) => companyForRun(run, index);

  // Newest run's signal feed per company (mirrors the digest route wiring).
  // Keyed by normalized key so spelling variants share one feed.
  const feedByCompany = new Map<string, DealSignalFeed | null>();
  for (const run of runs) {
    const key = normalizeCompanyKey(forRun(run));
    if (feedByCompany.has(key)) continue;
    feedByCompany.set(key, demoSignalFeedForRun(run, index.titleToSlug));
  }

  const entries = buildDigestEntries(runs, {
    companyForRun: forRun,
    feedForCompany: (company) =>
      feedByCompany.get(normalizeCompanyKey(company)) ?? null,
  });
  const totals = digestTotals(entries);

  // The full call cluster per company, newest first.
  const rowsByCompany = new Map<string, CompanyCluster["calls"]>();
  for (const run of runs) {
    if (!run.notes) continue;
    const key = normalizeCompanyKey(forRun(run));
    const row = toRecordingRow(run, index);
    rowsByCompany.set(key, [
      ...(rowsByCompany.get(key) ?? []),
      {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        score: row.score,
        dealState: row.dealState,
      },
    ]);
  }

  const clusters: CompanyCluster[] = entries.map((entry) => ({
    company: entry.company,
    companyKey: entry.companyKey,
    callCount: entry.callCount,
    callKindLabel: KIND_LABEL[entry.callKind],
    isSales: entry.callKind === "sales",
    momentum: entry.momentum
      ? { score: entry.momentum.score, direction: entry.momentum.direction }
      : null,
    dealState: entry.momentum ? dealState(entry.momentum.direction) : null,
    latestAt: entry.latestRun.createdAt,
    highlights: entry.highlights,
    nextSteps: entry.nextSteps,
    openObjections: entry.openObjections,
    riskAlerts: entry.riskAlerts.map((a) => ({
      severity: a.severity,
      title: a.title,
      play: a.play,
    })),
    calls: (rowsByCompany.get(entry.companyKey) ?? []).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  }));

  return (
    <CompaniesClient
      clusters={clusters}
      totals={{
        companies: totals.companies,
        calls: totals.calls,
        advancing: totals.advancing,
        steady: totals.steady,
        stalling: totals.stalling,
        atRisk: totals.atRisk,
      }}
    />
  );
}
