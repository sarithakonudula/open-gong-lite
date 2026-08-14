import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="app-light min-h-svh flex-1">{children}</div>;
}
