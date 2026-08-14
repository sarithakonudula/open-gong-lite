// Global search — one query across every entity the app knows about:
// recordings (titles, transcripts, shipped notes), company clusters, and the
// follow-up template library. Powers the ⌘K command palette.

import {
  buildSampleCompanyIndex,
  companyForRun,
  groupRunsByCompany,
} from "@/lib/company";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";
import { templateLibrary } from "@/lib/template-email";
import type { RunRecord } from "@/lib/types";

export type RecordingHit = {
  id: string;
  title: string;
  company: string;
  createdAt: string;
  /** Short excerpt around the match, e.g. a transcript line or note card. */
  snippet: string | null;
  /** Where the match came from: title, transcript, or notes. */
  matchedIn: "title" | "transcript" | "notes";
};

export type CompanyHit = {
  key: string;
  name: string;
  calls: number;
  lastCallAt: string;
};

export type TemplateHit = {
  id: string;
  title: string;
  short: string;
};

export type GlobalSearchResults = {
  recordings: RecordingHit[];
  companies: CompanyHit[];
  templates: TemplateHit[];
};

const SNIPPET_RADIUS = 60;

/** Trim a matching line down to a readable excerpt centered on the match. */
function excerpt(line: string, q: string): string {
  const at = line.toLowerCase().indexOf(q);
  if (at < 0) return line.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(line.length, at + q.length + SNIPPET_RADIUS);
  return (
    (start > 0 ? "…" : "") +
    line.slice(start, end).trim() +
    (end < line.length ? "…" : "")
  );
}

function noteLines(run: RunRecord): string[] {
  const notes = run.notes;
  if (!notes) return [];
  return [
    ...notes.summary.map((c) => c.text),
    ...notes.objections.map((c) => c.text),
    ...notes.nextSteps.map((c) => c.text),
    ...(notes.pain?.map((c) => c.text) || []),
    ...(notes.pricing?.map((c) => c.text) || []),
    ...(notes.competitors?.map((c) => c.text) || []),
  ];
}

function matchRun(
  run: RunRecord,
  company: string,
  q: string,
): RecordingHit | null {
  const title = run.notes?.title || run.sourceLabel;
  if (
    title.toLowerCase().includes(q) ||
    company.toLowerCase().includes(q) ||
    run.sourceLabel.toLowerCase().includes(q)
  ) {
    return {
      id: run.id,
      title,
      company,
      createdAt: run.createdAt,
      snippet: null,
      matchedIn: "title",
    };
  }

  for (const line of run.transcript) {
    const text = `${line.speaker}: ${line.text}`;
    if (text.toLowerCase().includes(q)) {
      return {
        id: run.id,
        title,
        company,
        createdAt: run.createdAt,
        snippet: excerpt(text, q),
        matchedIn: "transcript",
      };
    }
  }

  for (const line of noteLines(run)) {
    if (line.toLowerCase().includes(q)) {
      return {
        id: run.id,
        title,
        company,
        createdAt: run.createdAt,
        snippet: excerpt(line, q),
        matchedIn: "notes",
      };
    }
  }

  return null;
}

export async function globalSearch(
  query: string,
  limit = 8,
): Promise<GlobalSearchResults> {
  const q = query.trim().toLowerCase();
  if (!q) return { recordings: [], companies: [], templates: [] };

  const [runs, samples] = await Promise.all([listFullRuns(200), listSamples()]);
  const index = buildSampleCompanyIndex(samples);

  const recordings: RecordingHit[] = [];
  for (const run of runs) {
    const hit = matchRun(run, companyForRun(run, index), q);
    if (hit) recordings.push(hit);
    if (recordings.length >= limit) break;
  }

  const companies: CompanyHit[] = groupRunsByCompany(runs, index)
    .filter((g) => g.displayName.toLowerCase().includes(q))
    .slice(0, limit)
    .map((g) => ({
      key: g.key,
      name: g.displayName,
      calls: g.runs.length,
      lastCallAt: g.runs[0]?.createdAt ?? "",
    }));

  const templates: TemplateHit[] = templateLibrary()
    .filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.short.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q),
    )
    .slice(0, limit)
    .map((t) => ({ id: t.id, title: t.title, short: t.short }));

  return { recordings, companies, templates };
}
