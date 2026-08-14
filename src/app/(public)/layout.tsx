import type { ReactNode } from "react";

// Public pages (login, share) keep the original dark editorial look until
// they are re-skinned; the scope class carries the dark palette.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="legacy-dark min-h-svh flex-1">{children}</div>;
}
