import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getSettings,
  maskSettings,
  saveSettings,
} from "@/lib/settings";

export const runtime = "nodejs";

// Route protection: src/proxy.ts already gates /api/admin/* behind the login
// wall when OPENGONG_AUTH_PASSWORD is set; getSession() is a second check so
// a proxy misconfiguration can never expose settings writes.

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ settings: maskSettings(getSettings()) });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
