import { NextResponse } from "next/server";
import {
  DealSignal,
  DealSignalFeed,
  evaluateDealSignals,
} from "@/lib/deal-signals";
import {
  alertToTaskProperties,
  createTaskForDeal,
  HsDeal,
  hubspotConfigured,
  listOpenDeals,
} from "@/lib/hubspot";
import {
  buildSampleCompanyIndex,
  companyForRun,
  normalizeCompanyKey,
} from "@/lib/company";
import { alertsAtOrAbove, formatAlertsMessage, sendSlack } from "@/lib/notify";
import { listSamples } from "@/lib/samples";
import { getSettings, resolveSlackWebhook } from "@/lib/settings";
import { listFullRuns } from "@/lib/store";
import { RunRecord, TranscriptLine } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TASKS_PER_SCAN = 5;
const TYPICAL_CYCLE_DAYS = 30;

function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / 86_400_000);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4),
  );
}

/**
 * Best stored transcript for a deal: a run explicitly linked to this deal id
 * wins; token overlap on the company name is the evidence-only fallback
 * (it selects context for alerts, never a write target).
 */
function transcriptForDeal(
  deal: HsDeal,
  runs: RunRecord[],
  companies: Map<string, string>,
): TranscriptLine[] {
  const linked = runs
    .filter((r) => r.crm?.dealId === deal.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (linked) return linked.transcript;
  const dealTokens = tokenize(deal.name);
  let best: { overlap: number; run: RunRecord } | null = null;
  for (const run of runs) {
    const company = companies.get(run.id) ?? run.sourceLabel;
    const tokens = tokenize(company);
    let overlap = 0;
    for (const t of tokens) if (dealTokens.has(t)) overlap += 1;
    if (overlap > 0 && (!best || overlap > best.overlap)) {
      best = { overlap, run };
    }
  }
  return best?.run.transcript ?? [];
}

function signalsForHubspotDeal(deal: HsDeal, now: string): DealSignal[] {
  const nowMs = Date.parse(now);
  const signals: DealSignal[] = [];
  const idle = daysSince(deal.lastNoteAt ?? deal.lastModified, nowMs);
  if (idle != null && idle >= 1) {
    signals.push({
      type: "inactivity",
      company: deal.name,
      at: now,
      summary: `No CRM activity for ${idle} day${idle === 1 ? "" : "s"}`,
      attrs: { daysSince: idle, lastActivity: "CRM activity" },
    });
  }
  const age = daysSince(deal.createdAt, nowMs);
  if (age != null && age >= 1) {
    signals.push({
      type: "deal_age",
      company: deal.name,
      at: now,
      summary: `Deal open ${age} days`,
      attrs: { daysOpen: age, typicalCycleDays: TYPICAL_CYCLE_DAYS },
    });
  }
  return signals;
}

/**
 * POST /api/signals/scan — the "warn the rep" loop. Hit it from a cron
 * (Railway cron, GitHub Action, curl in crontab). With HubSpot configured it
 * scans open deals for inactivity/age risk grounded in stored call
 * transcripts; keyless it scans stored runs. Alerts at or above the admin
 * threshold go to Slack; pushable alerts become HubSpot tasks.
 *
 * Body (optional): { simulateIdleDays: 14 } — keyless demo lever that
 * pretends every stored run has been idle N days, so the risk loop is
 * showable without waiting a real day. Ignored when HubSpot is configured.
 */
export async function POST(request: Request) {
  let simulateIdleDays: number | null = null;
  try {
    const body = (await request.json()) as { simulateIdleDays?: unknown };
    const n = Number(body.simulateIdleDays);
    if (Number.isFinite(n) && n >= 1 && n <= 365) simulateIdleDays = Math.floor(n);
  } catch {
    // body optional
  }
  const now = new Date().toISOString();
  const floor = getSettings().riskNotifyFloor;
  const runs = await listFullRuns(100);
  // Same fallback chain as every other company surface (run.company → CRM →
  // sample → sourceLabel) — signals and Companies must never disagree.
  const index = buildSampleCompanyIndex(await listSamples());
  const companies = new Map<string, string>();
  for (const run of runs) {
    companies.set(run.id, companyForRun(run, index));
  }

  const feeds: DealSignalFeed[] = [];
  let tasksCreated = 0;

  if (hubspotConfigured()) {
    let deals: HsDeal[] = [];
    try {
      deals = await listOpenDeals(20);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `HubSpot scan failed: ${error.message.slice(0, 200)}`
              : "HubSpot scan failed",
        },
        { status: 502 },
      );
    }
    for (const deal of deals) {
      const signals = signalsForHubspotDeal(deal, now);
      if (signals.length === 0) continue;
      const feed = evaluateDealSignals({
        company: deal.name,
        transcript: transcriptForDeal(deal, runs, companies),
        signals,
        dealValueUsd: deal.amount,
        now,
        mode: "live",
      });
      feeds.push(feed);
      for (const alert of feed.alerts) {
        if (!alert.push || tasksCreated >= MAX_TASKS_PER_SCAN) continue;
        try {
          await createTaskForDeal(
            deal.id,
            alertToTaskProperties(alert, deal.name, now),
          );
          tasksCreated += 1;
        } catch {
          // task push is best-effort; the Slack alert still fires
        }
      }
    }
  } else {
    // Keyless: latest run per company, inactivity measured from run age.
    const latestByCompany = new Map<
      string,
      { company: string; run: RunRecord }
    >();
    for (const run of runs) {
      const company = companies.get(run.id) ?? run.sourceLabel;
      const key = normalizeCompanyKey(company);
      const existing = latestByCompany.get(key);
      if (!existing || run.createdAt > existing.run.createdAt) {
        latestByCompany.set(key, { company, run });
      }
    }
    for (const { company, run } of latestByCompany.values()) {
      const idle = simulateIdleDays ?? daysSince(run.createdAt, Date.parse(now));
      if (idle == null || idle < 1) continue;
      const feed = evaluateDealSignals({
        company,
        transcript: run.transcript,
        signals: [
          {
            type: "inactivity",
            company,
            at: now,
            summary: `No new call analyzed for ${idle} day${idle === 1 ? "" : "s"}`,
            attrs: { daysSince: idle, lastActivity: "last analyzed call" },
          },
        ],
        now,
        mode: "live",
      });
      feeds.push(feed);
    }
  }

  const notifiable = feeds
    .map((feed) => ({ feed, alerts: alertsAtOrAbove(feed, floor) }))
    .filter((f) => f.alerts.length > 0);
  let notified = false;
  if (notifiable.length > 0 && resolveSlackWebhook()) {
    notified = await sendSlack(formatAlertsMessage(notifiable));
  }

  return NextResponse.json({
    scannedAt: now,
    mode: hubspotConfigured() ? "hubspot" : "runs",
    companies: feeds.length,
    alerts: feeds.reduce((sum, f) => sum + f.alerts.length, 0),
    notified,
    tasksCreated,
    feeds: feeds.map((f) => ({
      company: f.company,
      alerts: f.alerts.map((a) => ({
        severity: a.severity,
        title: a.title,
        play: a.play,
      })),
    })),
  });
}
