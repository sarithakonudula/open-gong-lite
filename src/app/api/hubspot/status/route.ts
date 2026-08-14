import { NextResponse } from "next/server";
import { getPortalId, hubspotConfigured } from "@/lib/hubspot";

export const runtime = "nodejs";

export async function GET() {
  if (!hubspotConfigured()) {
    return NextResponse.json({ configured: false, connected: false });
  }
  const portalId = await getPortalId();
  return NextResponse.json({
    configured: true,
    connected: portalId != null,
    portalId,
  });
}
