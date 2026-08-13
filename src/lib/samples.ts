import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import {
  DealNotes,
  DealNotesSchema,
  SampleCall,
  TranscriptLine,
  TranscriptLineSchema,
} from "@/lib/types";

const SampleFileSchema = z.object({
  slug: z.string(),
  title: z.string(),
  company: z.string(),
  durationLabel: z.string(),
  description: z.string(),
  transcript: z.array(TranscriptLineSchema).min(1),
  notes: DealNotesSchema.optional(),
});

const SAMPLE_DIR = path.join(process.cwd(), "sample-calls");

export async function listSamples(): Promise<SampleCall[]> {
  const files = await fs.readdir(SAMPLE_DIR);
  const samples: SampleCall[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(SAMPLE_DIR, file), "utf8");
    const parsed = SampleFileSchema.parse(JSON.parse(raw));
    samples.push({
      slug: parsed.slug,
      title: parsed.title,
      company: parsed.company,
      durationLabel: parsed.durationLabel,
      description: parsed.description,
    });
  }

  return samples.sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadSample(slug: string): Promise<{
  meta: SampleCall;
  transcript: TranscriptLine[];
  notes: DealNotes | null;
}> {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  if (!safe || safe !== slug) {
    throw new Error("Invalid sample slug");
  }

  const raw = await fs.readFile(path.join(SAMPLE_DIR, `${safe}.json`), "utf8");
  const parsed = SampleFileSchema.parse(JSON.parse(raw));
  return {
    meta: {
      slug: parsed.slug,
      title: parsed.title,
      company: parsed.company,
      durationLabel: parsed.durationLabel,
      description: parsed.description,
    },
    transcript: parsed.transcript,
    notes: parsed.notes ?? null,
  };
}
