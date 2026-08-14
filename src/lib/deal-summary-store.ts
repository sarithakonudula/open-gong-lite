// Disk cache for generated deal summaries — one JSON per company under
// data/companies/. No database exists in this deployment; the hash of the
// cluster's run ids + updatedAt stamps (plus prompt version and which
// generator is desired) decides freshness, so re-analyzing a call, adding a
// call, or configuring an LLM after a deterministic fallback all regenerate.

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { config } from "@/lib/config";
import {
  DEAL_SUMMARY_PROMPT_VERSION,
  DealSummarySchema,
  type DealSummary,
} from "@/lib/deal-summary";
import type { RunRecord } from "@/lib/types";

function companiesDir(): string {
  return path.join(config.dataDir, "companies");
}

function cachePath(companyKey: string): string {
  // companyKey is [a-z0-9-] by construction (normalizeCompanyKey); refuse
  // anything else rather than build a path from it.
  if (!/^[a-z0-9-]{1,120}$/.test(companyKey)) {
    throw new Error(`Invalid company key: ${companyKey}`);
  }
  return path.join(companiesDir(), `${companyKey}.json`);
}

export const CachedDealSummarySchema = z.object({
  schema: z.literal("opengong.deal-summary-cache"),
  version: z.literal(1),
  companyKey: z.string(),
  inputsHash: z.string(),
  summary: DealSummarySchema,
});
export type CachedDealSummary = z.infer<typeof CachedDealSummarySchema>;

/** Order-insensitive over runs; changes when any run changes or the set does. */
export function dealSummaryInputsHash(
  runs: RunRecord[],
  generator: "llm" | "deterministic",
): string {
  const parts = runs
    .map((run) => `${run.id}:${run.updatedAt}`)
    .sort()
    .join("|");
  return createHash("sha256")
    .update(`v${DEAL_SUMMARY_PROMPT_VERSION}|${generator}|${parts}`)
    .digest("hex");
}

export async function readCachedDealSummary(
  companyKey: string,
): Promise<CachedDealSummary | null> {
  try {
    const raw = await fs.readFile(cachePath(companyKey), "utf8");
    return CachedDealSummarySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeCachedDealSummary(
  entry: CachedDealSummary,
): Promise<void> {
  await fs.mkdir(companiesDir(), { recursive: true });
  await fs.writeFile(
    cachePath(entry.companyKey),
    JSON.stringify(entry, null, 2),
    "utf8",
  );
}

/**
 * One generation per company at a time — two tabs opening the same company
 * share a single LLM call. Module-level, so it holds for this process only
 * (fine for the single-instance deployment).
 */
const inFlight = new Map<string, Promise<DealSummary>>();

export async function dedupeInFlight(
  companyKey: string,
  produce: () => Promise<DealSummary>,
): Promise<DealSummary> {
  const pending = inFlight.get(companyKey);
  if (pending) return pending;
  const promise = produce().finally(() => inFlight.delete(companyKey));
  inFlight.set(companyKey, promise);
  return promise;
}
