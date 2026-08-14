import type { ReactNode } from "react";

// Public pages (login, share) render without the app sidebar.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh flex-1">{children}</div>;
}
