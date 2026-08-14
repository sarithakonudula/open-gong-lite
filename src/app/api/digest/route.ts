import { NextRequest, NextResponse } from "next/server";
import {
  buildSampleCompanyIndex,
  companyForRun as resolveCompanyForRun,
} from "@/lib/company";
import { demoSignalFeedForRun } from "@/lib/deal-signals";
import { buildDigest, toPublicDigest } from "@/lib/digest";
import { sendSlack } from "@/lib/notify";
import { listSamples } from "@/lib/samples";
import { resolveSlackWebhook } from "@/lib/settings";
import { listFullRuns } from "@/lib/store";
import { RunRecord } from "@/lib/types";

export const runtime = "nodejs";

async function generateDigest() {
  const runs = await listFullRuns(200);
  const samples = await listSamples();
  const index = buildSampleCompanyIndex(samples);
  const titleToSlug = index.titleToSlug;

  const companyForRun = (run: RunRecord): string =>
    resolveCompanyForRun(run, index);

  // Signal feeds per company from the newest run that has one.
  const feedByCompany = new Map<
    string,
    ReturnType<typeof demoSignalFeedForRun>
  >();
  for (const run of runs) {
    const company = companyForRun(run);
    if (feedByCompany.has(company)) continue;
    feedByCompany.set(company, demoSignalFeedForRun(run, titleToSlug));
  }

  return buildDigest(runs, {
    companyForRun,
    feedForCompany: (company) => feedByCompany.get(company) ?? null,
  });
}

/** GET — the management digest as JSON + markdown (public projection only). */
export async function GET() {
  return NextResponse.json({ digest: toPublicDigest(await generateDigest()) });
}

/** POST { send: true } — build and push the digest to Slack. */
export async function POST(request: NextRequest) {
  let send = false;
  try {
    send = ((await request.json()) as { send?: unknown }).send === true;
  } catch {
    // body optional
  }
  const digest = await generateDigest();
  if (!send) return NextResponse.json({ digest: toPublicDigest(digest) });
  if (!resolveSlackWebhook()) {
    return NextResponse.json(
      { error: "Slack webhook is not configured — add it on /admin" },
      { status: 400 },
    );
  }
  const sent = await sendSlack(digest.markdown.slice(0, 3800));
  return NextResponse.json({ digest: toPublicDigest(digest), sent });
}
