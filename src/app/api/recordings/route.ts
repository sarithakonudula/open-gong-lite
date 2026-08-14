import { NextRequest, NextResponse } from "next/server";
import { toRecordingRow } from "@/lib/recordings-view";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";
import { RunRecord } from "@/lib/types";

export const runtime = "nodejs";

/** Enriched run list for the Recordings screen — all fields from gated data. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const runs = await listFullRuns(200);
  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));
  const slugToCompany = Object.fromEntries(samples.map((s) => [s.slug, s.company]));
  const companyForRun = (run: RunRecord): string => {
    const slug =
      run.sampleSlug ||
      (run.source === "sample" ? titleToSlug[run.sourceLabel] : undefined);
    return (slug && slugToCompany[slug]) || run.crm?.company || run.sourceLabel;
  };

  let rows = runs.filter((r) => r.notes).map((r) => toRecordingRow(r, companyForRun));
  if (q) {
    rows = rows.filter((r) =>
      [r.title, r.company, r.quote ?? "", ...r.tags]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }
  return NextResponse.json({ recordings: rows });
}
