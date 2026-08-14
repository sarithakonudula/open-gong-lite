import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/AppSidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full">
      <AppSidebar />
      <main className="min-h-svh flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
