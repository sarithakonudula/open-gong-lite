import { NextRequest, NextResponse } from "next/server";
import { detectLanguage } from "@/lib/language";
import {
  getMethodologyPack,
  scoreCallWithLlm,
} from "@/lib/methodology";
import { getSettings, isLanguageAllowed } from "@/lib/settings";
import { hasLlmAvailable } from "@/lib/llm";
import { getRun, saveRun } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PackIdSchema = /^[a-z0-9_-]{1,40}$/;

export async function POST(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  if (!(await hasLlmAvailable())) {
    return NextResponse.json(
      {
        error:
          "LLM is not configured — set keys on /admin or run Ollama locally",
      },
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

  // Admin language filter: when on, calls detected outside the allowed set
  // are refused LLM scoring — the transcript stays viewable, no tokens spent.
  const settings = getSettings();
  if (settings.languageFilterEnabled) {
    const detected = detectLanguage(run.transcript);
    if (!isLanguageAllowed(detected.code, settings)) {
      return NextResponse.json(
        {
          error: `Language filter: detected "${detected.code}" is not in the allowed set (${settings.allowedLanguages.join(", ")}). Adjust it on /admin.`,
        },
        { status: 400 },
      );
    }
  }

  try {
    const { card, rawVerdict } = await scoreCallWithLlm(pack, run.transcript, {
      dealValueUsd,
    });
    // Persist the raw verdict so the coaching loop can trend this rep's
    // traits across calls (re-gated on read, never trusted as-is).
    await saveRun({
      ...run,
      methodology: {
        packId,
        dealValueUsd,
        scoredAt: new Date().toISOString(),
        verdict: rawVerdict,
      },
    });
    return NextResponse.json({ card });
  } catch {
    return NextResponse.json({ error: "Scoring failed" }, { status: 502 });
  }
}
