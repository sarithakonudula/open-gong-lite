import { NextResponse } from "next/server";
import { buildNotificationFeed } from "@/lib/notifications-server";

export const runtime = "nodejs";

/** GET — notification ids + timestamps; the sidebar computes unread locally. */
export async function GET() {
  const items = await buildNotificationFeed();
  return NextResponse.json({
    ids: items.map((item) => item.id),
  });
}
