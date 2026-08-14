import { AppShell } from "@/components/electron/AppShell";

export const metadata = { title: "electron — coaching on gated call data" };

export default function ElectronLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
