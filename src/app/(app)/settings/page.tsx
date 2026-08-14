import {
  SettingsClient,
  SettingsTab,
} from "@/components/settings/SettingsClient";
import { isAuthEnabled } from "@/lib/auth";

export const metadata = { title: "Settings — OpenGong Lite" };
export const dynamic = "force-dynamic";

const VALID_TABS = new Set<SettingsTab>([
  "profile",
  "notifications",
  "integrations",
  "team",
  "billing",
  "danger",
]);

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const initialTab: SettingsTab = VALID_TABS.has(tab as SettingsTab)
    ? (tab as SettingsTab)
    : "profile";
  return (
    <SettingsClient initialTab={initialTab} authEnabled={isAuthEnabled()} />
  );
}
