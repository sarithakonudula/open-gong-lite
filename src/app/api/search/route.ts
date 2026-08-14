import { NextRequest, NextResponse } from "next/server";
import { globalSearch } from "@/lib/global-search";

export const runtime = "nodejs";

/** Global search across recordings, companies, and templates (⌘K palette). */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "8");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 20))
      : 8;
    const results = await globalSearch(q, limit);
    return NextResponse.json({ query: q, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
