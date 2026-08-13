import { NextResponse } from "next/server";
import { getSession, isAuthEnabled } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authRequired: isAuthEnabled(),
    authenticated: Boolean(session),
    user: session?.sub ?? null,
  });
}
