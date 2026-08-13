import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { config } from "@/lib/config";
import { RunRecord, RunRecordSchema } from "@/lib/types";

function runsDir(): string {
  return path.join(config.dataDir, "runs");
}

function runPath(id: string) {
  return path.join(runsDir(), `${id}.json`);
}

export async function ensureStore(): Promise<void> {
  await fs.mkdir(runsDir(), { recursive: true });
}

export function newShareToken(): string {
  return randomBytes(12).toString("hex");
}

export async function saveRun(run: RunRecord): Promise<RunRecord> {
  await ensureStore();
  const parsed = RunRecordSchema.parse({
    ...run,
    updatedAt: new Date().toISOString(),
  });
  await fs.writeFile(runPath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}

export async function getRun(id: string): Promise<RunRecord | null> {
  try {
    const raw = await fs.readFile(runPath(id), "utf8");
    return RunRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function getRunByShareToken(
  token: string,
): Promise<RunRecord | null> {
  await ensureStore();
  const dir = runsDir();
  const files = await fs.readdir(dir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const run = RunRecordSchema.parse(JSON.parse(raw));
    if (run.shareToken === token) return run;
  }
  return null;
}

export type RunSummary = {
  id: string;
  createdAt: string;
  status: RunRecord["status"];
  source: RunRecord["source"];
  sourceLabel: string;
  title: string;
};

function toSummary(run: RunRecord): RunSummary {
  return {
    id: run.id,
    createdAt: run.createdAt,
    status: run.status,
    source: run.source,
    sourceLabel: run.sourceLabel,
    title: run.notes?.title || run.sourceLabel,
  };
}

export async function listRuns(limit = 40): Promise<RunSummary[]> {
  await ensureStore();
  const dir = runsDir();
  const files = await fs.readdir(dir);
  const runs: RunRecord[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      runs.push(RunRecordSchema.parse(JSON.parse(raw)));
    } catch {
      // skip corrupt files
    }
  }

  return runs
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(toSummary);
}

export async function searchRuns(
  query: string,
  limit = 40,
): Promise<RunSummary[]> {
  const q = query.trim().toLowerCase();
  if (!q) return listRuns(limit);

  await ensureStore();
  const dir = runsDir();
  const files = await fs.readdir(dir);
  const hits: RunRecord[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const run = RunRecordSchema.parse(JSON.parse(raw));
      const haystack = [
        run.sourceLabel,
        run.notes?.title || "",
        ...run.transcript.map((line) => `${line.speaker} ${line.text}`),
        ...(run.notes?.summary.map((c) => c.text) || []),
        ...(run.notes?.objections.map((c) => c.text) || []),
        ...(run.notes?.nextSteps.map((c) => c.text) || []),
      ]
        .join("\n")
        .toLowerCase();
      if (haystack.includes(q)) hits.push(run);
    } catch {
      // skip corrupt files
    }
  }

  return hits
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(toSummary);
}
