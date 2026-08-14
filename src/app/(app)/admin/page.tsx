import { redirect } from "next/navigation";

// The admin console now lives in Settings ▸ Integrations.
export default function AdminPage() {
  redirect("/settings?tab=integrations");
}
