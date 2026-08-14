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

export const ClaimStatusSchema = z.enum([
  "verified",
  "segment_corrected",
  "uncorroborated",
  "blocked_injection",
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const EMAILABLE_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "verified",
  "segment_corrected",
]);

export const ClaimSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1),
  evidence: EvidenceSchema,
  status: ClaimStatusSchema.optional(),
  blockedReasons: z.array(z.string()).optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const CoverageBandSchema = z.enum([
  "SHIPPED",
  "SHIPPED_WITH_CORRECTIONS",
  "PARTIAL_CLAIMS_DROPPED",
  "PARTIAL_LOW_COVERAGE",
  "FAILED_UNPROVEN",
]);
export type CoverageBand = z.infer<typeof CoverageBandSchema>;

export const CoverageSchema = z.object({
  band: CoverageBandSchema,
  ratio: z.number().min(0).max(1),
  stats: z.object({
    verified: z.number().int().nonnegative(),
    segment_corrected: z.number().int().nonnegative(),
    uncorroborated: z.number().int().nonnegative(),
    blocked_injection: z.number().int().nonnegative(),
    attempted: z.number().int().nonnegative(),
    corroborated: z.number().int().nonnegative(),
  }),
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const FollowUpEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  evidence: EvidenceSchema,
  status: ClaimStatusSchema.optional(),
});
export type FollowUpEmail = z.infer<typeof FollowUpEmailSchema>;

/**
 * The second, template routed email variant.
 *
 * It is stored on the run, never accepted from a model: DealNotesSchema below
 * is the contract the extractor answers, and zod strips anything it does not
 * name, so a model that tries to supply its own routed variant has it dropped
 * before the gate ever runs. The only way this field gets set is the harness
 * setting it, after the gate, from claims the gate passed.
 */
export const RoutedFollowUpEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  bullets: z
    .array(z.object({ text: z.string(), claimId: z.string().min(1) }))
    .min(1),
  template: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    title: z.string().min(1),
    short: z.string().min(1),
    explainer: z.string().min(1),
  }),
  provenance: z.object({
    model: z.string().min(1),
    source: z.string().min(1),
    cut: z.number().int().nonnegative(),
    offTemplateCut: z.number().int().nonnegative(),
  }),
});
export type RoutedFollowUpEmail = z.infer<typeof RoutedFollowUpEmailSchema>;

export const DealNotesSchema = z.object({
  title: z.string().min(1),
  summary: z.array(ClaimSchema).min(1),
  objections: z.array(ClaimSchema).default([]),
  // A short discovery call may contain no buying intent or agreed next step.
  // Empty is more honest than forcing an unsupported "not stated" claim.
  intent: z.array(ClaimSchema).default([]),
  nextSteps: z.array(ClaimSchema).default([]),
  pain: z.array(ClaimSchema).default([]),
  pricing: z.array(ClaimSchema).default([]),
  competitors: z.array(ClaimSchema).default([]),
  followUpEmail: FollowUpEmailSchema,
  coverage: CoverageSchema.optional(),
});
export type DealNotes = z.infer<typeof DealNotesSchema>;

/**
 * Where the notes on a run came from. Set by the harness after the gate, never
 * accepted from a model: DealNotesSchema is the contract the extractor answers
 * and zod strips anything it does not name, so a keyword pass cannot label
 * itself "model" to win the ordering on the page.
 *
 * `model` covers a summarizer or language model. `keyword` is the local
 * pattern extractor. `curated` is notes that shipped with a sample.
 */
export const NotesSourceSchema = z.enum(["model", "keyword", "curated"]);
export type NotesSource = z.infer<typeof NotesSourceSchema>;

/**
 * What a run stores: the gated notes, plus the routed variant when one was
 * generated. Additive and optional, so every run written before this existed
 * still parses and still renders the same page.
 */
export const RunNotesSchema = DealNotesSchema.extend({
  routedFollowUp: RoutedFollowUpEmailSchema.optional(),
  notesSource: NotesSourceSchema.optional(),
});
export type RunNotes = z.infer<typeof RunNotesSchema>;

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
  /** Customer/company this call belongs to — groups runs into deal clusters. */
  company: z.string().optional(),
  /**
   * When the call actually happened (ISO), for imported/historical calls.
   * createdAt is upload time and stays the fallback — see callDateForRun.
   */
  callDate: z.string().optional(),
  /** Sample slug when source is sample — used to attach a stored methodology verdict. */
  sampleSlug: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  shareToken: z.string(),
  transcript: z.array(TranscriptLineSchema).default([]),
  notes: RunNotesSchema.nullable().default(null),
  attempts: z.array(AttemptRecordSchema).default([]),
  error: z.string().nullable().default(null),
  audioContentType: z.string().nullable().optional(),
  /**
   * Confirmed CRM deal link. Once set, every write-back targets this deal —
   * name-based matching is only used to propose candidates, never to write.
   */
  crm: z
    .object({
      dealId: z.string().min(1),
      dealName: z.string(),
      company: z.string(),
      linkedAt: z.string(),
    })
    .nullable()
    .optional(),
  /**
   * Persisted methodology verdict (raw LLM output, re-gated on read).
   * Presence powers the coaching loop: trait trends across a rep's calls.
   */
  methodology: z
    .object({
      packId: z.string(),
      dealValueUsd: z.number().nullable(),
      scoredAt: z.string(),
      verdict: z.unknown(),
    })
    .nullable()
    .optional(),
  budget: z.object({
    maxAttempts: z.number(),
    maxTokensEstimate: z.number(),
    deadlineMs: z.number(),
  }),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export type SampleDealArc = {
  id: string;
  seq: number;
  beat: string;
};

export type SampleCall = {
  slug: string;
  title: string;
  company: string;
  durationLabel: string;
  description: string;
  dealArc?: SampleDealArc;
  audioFile?: string;
};

export function isEmailableStatus(
  status: ClaimStatus | undefined,
): boolean {
  return status != null && EMAILABLE_STATUSES.has(status);
}
