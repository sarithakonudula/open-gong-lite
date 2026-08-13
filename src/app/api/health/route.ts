import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight liveness probe for Railway healthchecks. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "opengong-lite",
    time: new Date().toISOString(),
  });
}
