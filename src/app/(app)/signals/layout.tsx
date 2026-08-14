import type { ReactNode } from "react";

// Unconverted page: renders in the original dark editorial style inside the
// light shell until it is re-skinned.
export default function LegacyDarkLayout({ children }: { children: ReactNode }) {
  return <div className="legacy-dark min-h-svh">{children}</div>;
}
