import { z } from "zod";

export const RunStatusSchema = z.enum(["running", "shipped", "partial", "failed"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const TranscriptLineSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  speaker: z.string().min(1),
  text: z.string().min(1),
  startMs: z.number().optional(),
  endMs: z.number().optional(),
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const EvidenceSchema = z.object({
  lineId: z.string().min(1),
  quote: z.string().min(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ClaimSchema = z.object({
  text: z.string().min(1),
  evidence: EvidenceSchema,
});
export type Claim = z.infer<typeof ClaimSchema>;

export const DealNotesSchema = z.object({
  title: z.string().min(1),
  summary: z.array(ClaimSchema).min(1),
  objections: z.array(ClaimSchema).default([]),
  intent: z.array(ClaimSchema).min(1),
  nextSteps: z.array(ClaimSchema).min(1),
  followUpEmail: z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
    evidence: EvidenceSchema,
  }),
});
export type DealNotes = z.infer<typeof DealNotesSchema>;

export const GateFailureSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});
export type GateFailure = z.infer<typeof GateFailureSchema>;

export const AttemptRecordSchema = z.object({
  attempt: z.number().int().positive(),
  at: z.string(),
  ok: z.boolean(),
  reason: z.string().optional(),
  failures: z.array(GateFailureSchema).default([]),
});
export type AttemptRecord = z.infer<typeof AttemptRecordSchema>;

export const RunRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: RunStatusSchema,
  source: z.enum(["upload", "url", "sample", "live"]),
  sourceLabel: z.string(),
  shareToken: z.string(),
  transcript: z.array(TranscriptLineSchema).default([]),
  notes: DealNotesSchema.nullable().default(null),
  attempts: z.array(AttemptRecordSchema).default([]),
  error: z.string().nullable().default(null),
  budget: z.object({
    maxAttempts: z.number(),
    maxTokensEstimate: z.number(),
    deadlineMs: z.number(),
  }),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export type SampleCall = {
  slug: string;
  title: string;
  company: string;
  durationLabel: string;
  description: string;
};
