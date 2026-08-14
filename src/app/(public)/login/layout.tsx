import type { ReactNode } from "react";

// Login keeps the original dark editorial styling until re-skinned.
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className="legacy-dark min-h-svh">{children}</div>;
}
