import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { config } from "@/lib/config";
import {
  DealNotes,
  DealNotesSchema,
  SampleCall,
  SampleDealArc,
  TranscriptLine,
  TranscriptLineSchema,
} from "@/lib/types";

const SampleDealArcSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().positive(),
  beat: z.string().min(1),
});

const SampleFileSchema = z.object({
  slug: z.string(),
  title: z.string(),
  company: z.string(),
  durationLabel: z.string(),
  description: z.string(),
  transcript: z.array(TranscriptLineSchema).min(1),
  notes: DealNotesSchema.optional(),
  dealArc: SampleDealArcSchema.optional(),
  audioFile: z.string().min(1).optional(),
});

function toMeta(parsed: z.infer<typeof SampleFileSchema>): SampleCall {
  const dealArc: SampleDealArc | undefined = parsed.dealArc;
  return {
    slug: parsed.slug,
    title: parsed.title,
    company: parsed.company,
    durationLabel: parsed.durationLabel,
    description: parsed.description,
    ...(dealArc ? { dealArc } : {}),
    ...(parsed.audioFile ? { audioFile: parsed.audioFile } : {}),
  };
}

function sampleDir(): string {
  return config.sampleCallsDir;
}

export async function listSamples(): Promise<SampleCall[]> {
  const dir = sampleDir();
  const files = await fs.readdir(dir);
  const samples: SampleCall[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const parsed = SampleFileSchema.parse(JSON.parse(raw));
    samples.push(toMeta(parsed));
  }

  return samples.sort((a, b) => {
    const aArc = a.dealArc;
    const bArc = b.dealArc;
    if (aArc && bArc) {
      if (aArc.id !== bArc.id) return aArc.id.localeCompare(bArc.id);
      return aArc.seq - bArc.seq;
    }
    if (aArc) return -1;
    if (bArc) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function sampleAudioAbsolutePath(audioFile: string): string {
  if (
    !/^audio\/[a-z0-9._-]+\.(m4a|mp3|wav)$/i.test(audioFile)
  ) {
    throw new Error("Invalid sample audio path");
  }
  return path.join(sampleDir(), audioFile);
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

  const raw = await fs.readFile(
    path.join(sampleDir(), `${safe}.json`),
    "utf8",
  );
  const parsed = SampleFileSchema.parse(JSON.parse(raw));
  return {
    meta: toMeta(parsed),
    transcript: parsed.transcript,
    notes: parsed.notes ?? null,
  };
}
