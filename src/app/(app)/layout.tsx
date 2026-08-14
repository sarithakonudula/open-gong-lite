import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { GlobalSearch } from "@/components/shell/GlobalSearch";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full">
      <GlobalSearch />
      <AppSidebar />
      <main className="app-light min-h-svh flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
