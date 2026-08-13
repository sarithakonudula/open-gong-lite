import { NextResponse } from "next/server";
import { clearSessionCookie, isAuthEnabled } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true, authRequired: isAuthEnabled() });
}
