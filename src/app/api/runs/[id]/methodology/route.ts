import { NextRequest, NextResponse } from "next/server";
import { hasLlmFallback } from "@/lib/config";
import {
  getMethodologyPack,
  scoreCallWithLlm,
} from "@/lib/methodology";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PackIdSchema = /^[a-z0-9_-]{1,40}$/;

export async function POST(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  if (!hasLlmFallback()) {
    return NextResponse.json(
      { error: "LLM is not configured" },
      { status: 400 },
    );
  }

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let packId = "meddic";
  let dealValueUsd: number | null = null;
  try {
    const body = (await request.json()) as {
      packId?: unknown;
      dealValueUsd?: unknown;
    };
    if (typeof body.packId === "string" && PackIdSchema.test(body.packId)) {
      packId = body.packId;
    }
    if (body.dealValueUsd != null) {
      const n = Number(body.dealValueUsd);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
        return NextResponse.json(
          { error: "Invalid deal value" },
          { status: 400 },
        );
      }
      dealValueUsd = n;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const pack = getMethodologyPack(packId);
  if (!pack) {
    return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
  }

  if (run.transcript.length === 0) {
    return NextResponse.json(
      { error: "Run has no transcript" },
      { status: 400 },
    );
  }

  try {
    const card = await scoreCallWithLlm(pack, run.transcript, { dealValueUsd });
    return NextResponse.json({ card });
  } catch {
    return NextResponse.json({ error: "Scoring failed" }, { status: 502 });
  }
}
