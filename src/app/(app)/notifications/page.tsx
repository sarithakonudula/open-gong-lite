import { NotificationsFeed } from "@/components/notifications/NotificationsFeed";
import { buildNotificationFeed } from "@/lib/notifications-server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications — OpenGong Lite" };

export default async function NotificationsPage() {
  const items = await buildNotificationFeed();
  return <NotificationsFeed items={items} />;
}
