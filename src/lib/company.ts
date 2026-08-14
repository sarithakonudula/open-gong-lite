// Company resolution — one fallback chain for every surface that groups runs
// into per-company deal clusters (Recordings, Companies, digest, signals).

import type { RunRecord, SampleCall } from "@/lib/types";

export type SampleCompanyIndex = {
  titleToSlug: Record<string, string>;
  slugToCompany: Record<string, string>;
};

export function buildSampleCompanyIndex(
  samples: SampleCall[],
): SampleCompanyIndex {
  return {
    titleToSlug: Object.fromEntries(samples.map((s) => [s.title, s.slug])),
    slugToCompany: Object.fromEntries(samples.map((s) => [s.slug, s.company])),
  };
}

/**
 * Fallback chain: explicit company on the run → confirmed CRM link →
 * sample fixture company → sourceLabel (filename / link title).
 */
export function companyForRun(
  run: RunRecord,
  index?: SampleCompanyIndex,
): string {
  if (run.company?.trim()) return run.company.trim();
  if (run.crm?.company?.trim()) return run.crm.company.trim();
  const slug =
    run.sampleSlug ||
    (run.source === "sample" ? index?.titleToSlug[run.sourceLabel] : undefined);
  const sampleCompany = slug ? index?.slugToCompany[slug] : undefined;
  return sampleCompany || run.sourceLabel;
}
