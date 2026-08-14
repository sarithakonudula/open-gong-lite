import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { hasLlmAvailable } from "@/lib/llm";
import { ensurePyaiKey, getKeyStatus } from "@/lib/pyai-key";

export const runtime = "nodejs";

export async function GET() {
  const before = await getKeyStatus();
  let status = before;
  const llmFallback = await hasLlmAvailable();

  if (!before.configured && config.autoMintSandbox) {
    try {
      status = await ensurePyaiKey();
    } catch (error) {
      return NextResponse.json({
        pyai: {
          configured: false,
          source: "none",
          preview: null,
          error:
            error instanceof Error ? error.message : "Sandbox mint failed",
        },
        llmFallback,
        recapPackId: config.recapPackId,
        hearModel: config.hearModel,
        hearJobModel: config.hearJobModel,
      });
    }
  }

  return NextResponse.json({
    pyai: {
      configured: status.configured,
      source: status.source,
      preview: status.preview,
      scopes: status.scopes,
      expiresAt: status.expiresAt,
    },
    llmFallback,
    recapPackId: config.recapPackId,
    hearModel: config.hearModel,
    hearJobModel: config.hearJobModel,
  });
}
