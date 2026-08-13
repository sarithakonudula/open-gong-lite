"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" className={className || "btn-ghost"} onClick={logout}>
      Log out
    </button>
  );
}
