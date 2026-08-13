import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
