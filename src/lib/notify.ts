// Outbound notifications — Slack incoming webhook. Used by the risk scan
// (deal-at-risk warnings reach the rep where they live, not a page they have
// to remember to open) and the management digest.

import { AlertSeverity, DealAlert, DealSignalFeed } from "@/lib/deal-signals";
import { resolveSlackWebhook } from "@/lib/settings";

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  hot: 0,
  high: 1,
  watch: 2,
  info: 3,
};

export function alertsAtOrAbove(
  feed: DealSignalFeed,
  floor: AlertSeverity,
): DealAlert[] {
  return feed.alerts.filter(
    (a) => SEVERITY_ORDER[a.severity] <= SEVERITY_ORDER[floor],
  );
}

const BADGE: Record<AlertSeverity, string> = {
  hot: "🔥",
  high: "🔴",
  watch: "🟡",
  info: "⚪",
};

/** Slack mrkdwn message for one or more company feeds. Pure — unit-testable. */
export function formatAlertsMessage(
  feeds: Array<{ feed: DealSignalFeed; alerts: DealAlert[] }>,
): string {
  const lines: string[] = ["*OpenGong Lite — deal risk alerts*"];
  for (const { feed, alerts } of feeds) {
    if (alerts.length === 0) continue;
    lines.push("");
    lines.push(`*${feed.company}*`);
    for (const a of alerts) {
      lines.push(`${BADGE[a.severity]} *${a.title}* — ${a.detail}`);
      const quote = a.context?.evidence[0];
      if (a.evidenceState === "cited" && quote) {
        lines.push(`> "${quote.quote}" [${quote.lineId}]`);
      }
      lines.push(`_Play:_ ${a.play}`);
    }
  }
  return lines.join("\n").slice(0, 3800);
}

export async function sendSlack(
  text: string,
  webhookUrl: string | null = resolveSlackWebhook(),
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
