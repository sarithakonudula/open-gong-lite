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

/**
 * Trailing corporate suffixes that don't distinguish one company from
 * another. "Brightsmile Dental Group" and "Brightsmile Dental" are the same
 * deal; a CRM link and a manual upload should never split it in two.
 */
const CORPORATE_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "group",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "holdings",
]);

/**
 * Stable grouping key for a company name: casefold, strip punctuation,
 * collapse whitespace, drop trailing corporate suffixes while at least one
 * token remains, join with "-". The key is [a-z0-9-] so it doubles as a safe
 * cache filename. Display names are never derived from this — the key only
 * decides which runs share a cluster.
 */
export function normalizeCompanyKey(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  while (
    tokens.length > 1 &&
    CORPORATE_SUFFIXES.has(tokens[tokens.length - 1]!)
  ) {
    tokens.pop();
  }
  return tokens.join("-") || "unknown";
}

export type CompanyGroup = {
  /** Normalized grouping key — also the cache filename for this company. */
  key: string;
  /** Resolved name of the newest run, for display. */
  displayName: string;
  /** Every run in the cluster, newest first by createdAt. */
  runs: RunRecord[];
};

/** Cluster runs by normalized company key. */
export function groupRunsByCompany(
  runs: RunRecord[],
  index?: SampleCompanyIndex,
): CompanyGroup[] {
  const byKey = new Map<string, { names: string[]; runs: RunRecord[] }>();
  for (const run of runs) {
    const name = companyForRun(run, index);
    const key = normalizeCompanyKey(name);
    const group = byKey.get(key) ?? { names: [], runs: [] };
    group.names.push(name);
    group.runs.push(run);
    byKey.set(key, group);
  }
  return [...byKey.entries()].map(([key, group]) => {
    const order = group.runs
      .map((run, i) => ({ run, name: group.names[i]! }))
      .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt));
    return {
      key,
      displayName: order[0]!.name,
      runs: order.map((entry) => entry.run),
    };
  });
}
