import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getSettings,
  maskSettings,
  saveSettings,
} from "@/lib/settings";

export const runtime = "nodejs";

// Route protection: src/proxy.ts gates /api/admin/* behind the login wall
// when OPENGONG_AUTH_PASSWORD is set; requireAdmin() is a second check that
// also refuses open-admin in production builds, so a public deployment
// without a password can never have its settings read or rewritten.

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ settings: maskSettings(getSettings()) });
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  let patch: Record<string, unknown>;
  try {
    patch = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const saved = await saveSettings(patch);
    return NextResponse.json({ settings: maskSettings(saved) });
  } catch {
    return NextResponse.json(
      { error: "Settings failed validation" },
      { status: 400 },
    );
  }
}
