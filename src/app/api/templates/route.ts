import { NextResponse } from "next/server";
import { templateLibrary } from "@/lib/template-email";

export const runtime = "nodejs";

/** The routed follow-up template library, for the Templates screen. */
export async function GET() {
  const templates = templateLibrary().map((t) => ({
    id: t.id,
    title: t.title,
    short: t.short,
    subject: t.subject,
    wordLimit: t.word_limit,
    explainer: t.panel?.explainer ?? null,
    routing: t.routing,
    blocks: t.blocks.map((b) => ({
      type: b.type,
      role: "role" in b ? b.role : undefined,
      label: "label" in b ? b.label : undefined,
      text: "text" in b ? b.text : undefined,
      section: "section" in b ? b.section : undefined,
      hint: "hint" in b ? b.hint : undefined,
    })),
  }));
  return NextResponse.json({ templates });
}
