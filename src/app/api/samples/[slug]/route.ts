import { NextRequest, NextResponse } from "next/server";
import { loadSample } from "@/lib/samples";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { slug } = await context.params;
    const sample = await loadSample(slug);
    return NextResponse.json({
      meta: sample.meta,
      transcript: sample.transcript,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sample not found";
    const status = message.includes("Invalid") ? 400 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
