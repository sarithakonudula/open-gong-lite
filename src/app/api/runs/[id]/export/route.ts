import { NextRequest, NextResponse } from "next/server";
import { notesToJson, notesToMarkdown } from "@/lib/export";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") || "json";
  if (format === "md" || format === "markdown") {
    const md = notesToMarkdown(run);
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="opengong-${id.slice(0, 8)}.md"`,
      },
    });
  }

  return NextResponse.json(notesToJson(run));
}
