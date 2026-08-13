import { NextRequest, NextResponse } from "next/server";
import {
  authHint,
  getAuthUsername,
  isAuthEnabled,
  setSessionCookie,
  verifyCredentials,
} from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      ok: true,
      authRequired: false,
      message: "Auth is disabled — set OPENGONG_AUTH_PASSWORD to enable.",
    });
  }

  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials payload" }, { status: 400 });
    }

    const { username, password } = parsed.data;
    if (!verifyCredentials(username, password)) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    await setSessionCookie(username.trim() || getAuthUsername());
    return NextResponse.json({ ok: true, user: username.trim() || getAuthUsername() });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    authRequired: isAuthEnabled(),
    usernameHint: isAuthEnabled() ? getAuthUsername() : null,
    hint: authHint(),
  });
}
