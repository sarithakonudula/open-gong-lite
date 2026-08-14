import { NextResponse } from "next/server";
import { z } from "zod";
import { loadSample } from "@/lib/samples";
import { TranscriptLineSchema } from "@/lib/types";
import {
  DealSignalSchema,
  demoDealSignalFeed,
  evaluateDealSignals,
} from "@/lib/deal-signals";

export const runtime = "nodejs";

/** GET → the deterministic demo feed (Brightsmile, zero keys). */
export async function GET() {
  const sample = await loadSample("brightsmile-01-discovery");
  if (!sample) {
    return NextResponse.json({ error: "demo sample missing" }, { status: 500 });
  }
  return NextResponse.json(demoDealSignalFeed(sample.transcript));
}

const EvaluateBodySchema = z.object({
  company: z.string().min(1),
  transcript: z.array(TranscriptLineSchema).default([]),
  signals: z.array(DealSignalSchema).min(1),
  dealValueUsd: z.number().nullable().optional(),
  now: z.string().optional(),
});

/** POST → evaluate caller-supplied signals (the Factors/webhook wiring point). */
export async function POST(request: Request) {
  const parsed = EvaluateBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  return NextResponse.json(evaluateDealSignals(parsed.data));
}
