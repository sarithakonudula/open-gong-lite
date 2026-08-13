import { NextResponse } from "next/server";
import { listSamples } from "@/lib/samples";

export const runtime = "nodejs";

export async function GET() {
  const samples = await listSamples();
  return NextResponse.json({ samples });
}
