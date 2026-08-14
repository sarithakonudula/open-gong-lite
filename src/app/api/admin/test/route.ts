import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPortalId, hubspotConfigured } from "@/lib/hubspot";
import { chatText } from "@/lib/llm";
import { sendSlack } from "@/lib/notify";
import { hasLlmConfigured, resolveSlackWebhook } from "@/lib/settings";

export const runtime = "nodejs";

/** Connectivity probes for the admin page: llm | hubspot | slack. */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  let kind = "";
  try {
    kind = String(((await request.json()) as { kind?: unknown }).kind ?? "");
  } catch {
    // fall through to unknown-kind error
  }

  try {
    if (kind === "llm") {
      if (!hasLlmConfigured()) {
        return NextResponse.json({ ok: false, detail: "LLM not configured" });
      }
      // Prompt must contain the word "JSON": providers that enforce the
      // OpenAI json_object contract (e.g. Groq) 400 otherwise.
      const raw = await chatText({
        system: 'Reply with exactly this JSON: {"pong": true}',
        user: "ping",
      });
      return NextResponse.json({ ok: raw.includes("pong"), detail: "LLM reachable" });
    }
    if (kind === "hubspot") {
      if (!hubspotConfigured()) {
        return NextResponse.json({ ok: false, detail: "HubSpot not configured" });
      }
      const portalId = await getPortalId();
      return NextResponse.json({
        ok: portalId != null,
        detail: portalId != null ? `Connected to portal ${portalId}` : "Token rejected",
      });
    }
    if (kind === "slack") {
      if (!resolveSlackWebhook()) {
        return NextResponse.json({ ok: false, detail: "Slack webhook not configured" });
      }
      const ok = await sendSlack("OpenGong Lite: webhook test — you're wired up. ✅");
      return NextResponse.json({ ok, detail: ok ? "Test message sent" : "Webhook rejected" });
    }
    return NextResponse.json({ error: "Unknown test kind" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 200) : "Test failed",
    });
  }
}
