import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "og_session";
const SESSION_DAYS = 7;

export type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Auth is on only when a password is configured (Railway / locked demos). */
export function isAuthEnabled(): boolean {
  return Boolean(env("OPENGONG_AUTH_PASSWORD"));
}

export function getAuthUsername(): string {
  return env("OPENGONG_AUTH_USER") || "demo";
}

function sessionSecret(): string {
  const secret = env("OPENGONG_SESSION_SECRET");
  if (secret && secret.length >= 16) return secret;
  // Dev fallback — set OPENGONG_SESSION_SECRET in production.
  return "opengong-dev-session-secret";
}

function b64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function createSessionToken(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username.slice(0, 80),
    iat: now,
    exp: now + SESSION_DAYS * 24 * 60 * 60,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still run a compare to reduce timing hints on length-only mismatch.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyCredentials(
  username: string,
  password: string,
): boolean {
  if (!isAuthEnabled()) return false;
  const expectedUser = getAuthUsername();
  const expectedPass = env("OPENGONG_AUTH_PASSWORD")!;
  return (
    safeEqualString(username.trim(), expectedUser) &&
    safeEqualString(password, expectedPass)
  );
}

export async function setSessionCookie(username: string): Promise<void> {
  const token = createSessionToken(username);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  if (!isAuthEnabled()) {
    return { sub: "open", iat: 0, exp: Number.MAX_SAFE_INTEGER };
  }
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload | null> {
  if (!isAuthEnabled()) return { sub: "open", iat: 0, exp: Number.MAX_SAFE_INTEGER };
  return getSession();
}

export function newCsrfNonce(): string {
  return randomBytes(16).toString("hex");
}

export function authHint(): string | null {
  return env("OPENGONG_AUTH_HINT") || null;
}
