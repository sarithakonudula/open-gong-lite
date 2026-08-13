import { NextRequest, NextResponse } from "next/server";
import { listRuns, searchRuns } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "24");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 24;
    const runs = q.trim() ? await searchRuns(q, limit) : await listRuns(limit);
    return NextResponse.json({ runs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
