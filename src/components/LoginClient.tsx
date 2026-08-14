"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(true);

  useEffect(() => {
    fetch("/api/auth/login")
      .then((res) => res.json())
      .then(
        (data: {
          authRequired?: boolean;
          usernameHint?: string | null;
          hint?: string | null;
        }) => {
          setAuthRequired(data.authRequired !== false);
          if (data.usernameHint) setUsername(data.usernameHint);
          if (data.hint) setHint(data.hint);
          if (data.authRequired === false) {
            router.replace("/");
          }
        },
      )
      .catch(() => undefined);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      const dest =
        nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  if (!authRequired) {
    return (
      <p className="text-fg-soft">Auth is off, redirecting…</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-5">
      <label className="block">
        <span className="text-xs uppercase tracking-[0.16em] text-fg-soft">
          Username
        </span>
        <input
          className="field mt-2"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-[0.16em] text-fg-soft">
          Password
        </span>
        <input
          className="field mt-2"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      {hint && (
        <p className="text-sm text-fg-soft">
          Demo hint: <span className="text-fg-muted">{hint}</span>
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-fg">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
        {busy ? "Signing in…" : "Sign in →"}
      </button>
    </form>
  );
}
