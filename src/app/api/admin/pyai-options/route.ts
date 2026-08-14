import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchPyaiOptions } from "@/lib/pyai-options";

export const runtime = "nodejs";

/** Models + transcription languages PyAI reports as available. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ options: await fetchPyaiOptions() });
}
