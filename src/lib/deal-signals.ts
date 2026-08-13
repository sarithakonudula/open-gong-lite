// Deal signals — proactive alerts on open deals, grounded in the conversation.
//
// The engine ingests raw signals from any source (de-anonymized website
// visits a la Factors/RB2B, support tickets, email engagement, inactivity,
// call commitments, stakeholder changes, competitor mentions, usage, news,
// renewal windows, meetings, stage moves), runs a declarative rule catalog
// over them, and emits alerts that are CONTEXTUAL: wherever possible the
// alert cites the exact transcript line that makes the signal mean something
// ("they pushed back on price on the call [L13] — the account is now on
// /pricing for the third time this week"). Evidence quotes run through the
// same L7 gate as deal notes: an alert can never cite a line that was not
// said.
//
// Noise control: severity tiers (hot / high / watch / info), one alert per
// rule+topic (aggregation, not one-alert-per-pageview), and deal-value-aware
// suppression — a transactional deal only surfaces hot+high, so small deals
// get urgency without a feed full of watch items.

import { z } from "zod";
import { gateEvidenceQuote } from "@/lib/harness/gates";
import type { TranscriptLine } from "@/lib/types";

// ── Signal input (one flat, extensible shape) ───────────────────────────────

export const SignalTypeSchema = z.enum([
  "website_visit", //   attrs: path, title?, count?
  "support_ticket", //  attrs: status(open|escalated|resolved), priority?, body?
  "email_event", //     attrs: kind(proposal_sent|opened|not_opened|link_click|gone_dark), daysSince?
  "inactivity", //      attrs: daysSince, lastActivity?
  "commitment", //      attrs: owner(rep|buyer), promise, due?, status(open|overdue|done), sourceLineId?
  "stakeholder_change", // attrs: person, change(left|new|role_change), role?
  "competitor_mention", // attrs: competitor, where(call|email|ticket|web)
  "usage", //           attrs: metric, direction(drop|spike), pct?
  "company_news", //    attrs: kind(funding|hiring|layoffs|leadership_change), headline?
  "renewal_window", //  attrs: vendor?, daysUntil  (incumbent contract expiry = switch window)
  "meeting_event", //   attrs: kind(no_show|cancelled|booked), label?
  "stage_change", //    attrs: from, to, direction(advanced|regressed)
  "relationship_stats", // attrs: contacts, seniorContacts?  (threading health)
  "deal_age", //        attrs: daysOpen, typicalCycleDays
  "engagement_score", // attrs: score(0-100), previous(0-100)
]);
export type SignalType = z.infer<typeof SignalTypeSchema>;

export const DealSignalSchema = z.object({
  type: SignalTypeSchema,
  company: z.string().min(1),
  /** ISO timestamp of the raw event. */
  at: z.string().min(1),
  /** Human label of the raw event, e.g. "Viewed /pricing" or the ticket subject. */
  summary: z.string().min(1),
  attrs: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});
export type DealSignal = z.infer<typeof DealSignalSchema>;

/** Loose adapter for vendor exports (Factors-style rows, CSV-ish objects). */
export function normalizeVisits(
  rows: Array<Record<string, unknown>>,
  company: string,
): DealSignal[] {
  return rows.flatMap((r) => {
    const path = String(r.path ?? r.page ?? r.url ?? "").replace(/^https?:\/\/[^/]+/, "");
    if (!path) return [];
    const at = String(r.at ?? r.timestamp ?? r.time ?? new Date(0).toISOString());
    const count = Number(r.count ?? r.visits ?? 1) || 1;
    return [{
      type: "website_visit" as const,
      company: String(r.company ?? r.domain ?? company),
      at,
      summary: `Viewed ${path}`,
      attrs: { path, count },
    }];
  });
}

// ── Conversation context (the part that makes an alert mean something) ──────

export type ConversationTopic = {
  id: string;
  label: string;
  /** Matches website paths and ticket/email text that belong to this topic. */
  pagePattern: RegExp;
  /** Matches transcript lines where this topic was actually discussed. */
  textPattern: RegExp;
};

export const CONVERSATION_TOPICS: ConversationTopic[] = [
  {
    id: "pricing",
    label: "Pricing",
    pagePattern: /pricing|plans|cost|quote/i,
    textPattern: /\b(pricing|price|expensive|budget|cost|renewal|per (seat|user|location))\b/i,
  },
  {
    id: "compliance",
    label: "Compliance & texting",
    pagePattern: /compliance|tcpa|hipaa|sms|texting|security|privacy/i,
    textPattern: /\b(tcpa|hipaa|compliance|compliant|text reminders|texting|test case)\b/i,
  },
  {
    id: "reliability",
    label: "Reliability & routing",
    pagePattern: /after-?hours|routing|reliability|uptime|status|support/i,
    textPattern: /\b(after hours|rings out|drop(s|ped)? mid|voice ?mail|support tickets?|restart the router|goes to a voice)\b/i,
  },
  {
    id: "integrations",
    label: "Integrations & stack",
    pagePattern: /integrations?|crm|hubspot|salesforce|api/i,
    textPattern: /\b(hubspot|salesforce|crm|dentrix|integrat\w+|sync)\b/i,
  },
  {
    id: "proof",
    label: "Proof & trust",
    pagePattern: /customers?|case-?stud|reviews?|testimonials?|compare|vs-|alternative/i,
    textPattern: /\b(proof it works|trust problem|got burned|case stud\w+|references?)\b/i,
  },
];

export type GatedQuote = {
  lineId: string;
  quote: string;
  status: "verified" | "segment_corrected" | "uncorroborated";
};

export type SignalContext = {
  topicId: string;
  topicLabel: string;
  evidence: GatedQuote[];
};

function gatedQuoteFromLine(line: TranscriptLine, matchIndex: number): GatedQuote {
  // Quote is a verbatim contiguous slice of the line by construction; the
  // gate still runs so a future refactor can never silently break receipts.
  const start = Math.max(0, matchIndex - 20);
  const quote = line.text.slice(start, start + 100).trim();
  const r = gateEvidenceQuote(quote, line.id, [line]);
  const status =
    r.verdict === "match_exact" || r.verdict === "match_normalized"
      ? ("verified" as const)
      : r.verdict === "segment_corrected"
        ? ("segment_corrected" as const)
        : ("uncorroborated" as const);
  return { lineId: r.matchedLineId ?? line.id, quote, status };
}

/** Find where a topic was discussed on the call; up to `max` gated quotes. */
export function topicEvidence(
  topic: ConversationTopic,
  transcript: TranscriptLine[],
  max = 2,
): GatedQuote[] {
  const out: GatedQuote[] = [];
  for (const line of transcript) {
    const m = topic.textPattern.exec(line.text);
    if (!m) continue;
    out.push(gatedQuoteFromLine(line, m.index));
    if (out.length >= max) break;
  }
  return out.filter((q) => q.status !== "uncorroborated");
}

export function topicForPath(path: string): ConversationTopic | null {
  return CONVERSATION_TOPICS.find((t) => t.pagePattern.test(path)) ?? null;
}

export function topicForText(text: string): ConversationTopic | null {
  return CONVERSATION_TOPICS.find((t) => t.textPattern.test(text)) ?? null;
}

function contextFor(
  topic: ConversationTopic | null,
  transcript: TranscriptLine[],
): SignalContext | null {
  if (!topic) return null;
  const evidence = topicEvidence(topic, transcript);
  if (evidence.length === 0) return null;
  return { topicId: topic.id, topicLabel: topic.label, evidence };
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = "hot" | "high" | "watch" | "info";
export type AlertDirection = "buying_intent" | "risk" | "stalled" | "momentum";

export type DealAlert = {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  direction: AlertDirection;
  title: string;
  detail: string;
  /** The concrete next move for the rep. */
  play: string;
  signals: DealSignal[];
  context: SignalContext | null;
  /**
   * Explicit abstain state (issue #2 invariant: cited or visibly abstaining,
   * never silent): "cited" when call evidence survived the gate, else
   * "signal_only" — the alert stands on the external signal alone.
   */
  evidenceState: "cited" | "signal_only";
  /**
   * Auto-resolution condition (the Gong Red Flag pattern: alerts clear on rep
   * action, not manual dismissal). Rendered so the rep knows what ends it.
   */
  resolvesWhen: string | null;
  /** True when this alert should be pushed to the CRM as a task. */
  push: boolean;
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  hot: 0,
  high: 1,
  watch: 2,
  info: 3,
};

type RuleCtx = {
  company: string;
  transcript: TranscriptLine[];
  dealValueUsd: number | null;
  nowMs: number;
};

type Rule = {
  id: string;
  signalType: SignalType;
  evaluate: (signals: DealSignal[], ctx: RuleCtx) => DealAlert[];
};

function mkAlert(
  ruleId: string,
  severity: AlertSeverity,
  direction: AlertDirection,
  title: string,
  detail: string,
  play: string,
  signals: DealSignal[],
  context: SignalContext | null,
  resolvesWhen: string | null = null,
): DealAlert {
  return {
    id: `${ruleId}:${signals[0]?.at ?? "0"}:${title.slice(0, 24)}`,
    ruleId,
    severity,
    direction,
    title,
    detail,
    play,
    signals,
    context,
    evidenceState: context && context.evidence.length > 0 ? "cited" : "signal_only",
    resolvesWhen,
    push: severity === "hot" || severity === "high",
  };
}

const PLAY_BY_TOPIC: Record<string, string> = {
  pricing:
    "Send the pricing recap that answers the exact objection from the call — with the payback math in their numbers — and offer a 15-minute pricing walk-through before they compare elsewhere.",
  compliance:
    "Send the compliance one-pager now and confirm the compliant flow is in the demo agenda — they are self-educating on the thing they flagged as a blocker.",
  reliability:
    "Lead the next touch with the reliability proof (uptime, routing walkthrough) — this is the pain that brought them in, and they are re-checking it.",
  integrations:
    "Confirm their exact stack is covered and send the integration doc for it — do not make them dig.",
  proof:
    "Send one customer story matching their size and vertical, with numbers — they are looking for permission to trust you.",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const SIGNAL_RULES: Rule[] = [
  {
    // Page-level intent, aggregated per conversation topic — never one alert
    // per pageview. Competitor/comparison pages escalate on their own.
    id: "intent_page_activity",
    signalType: "website_visit",
    evaluate(signals, ctx) {
      const recent = signals.filter((s) => ctx.nowMs - Date.parse(s.at) <= WEEK_MS);
      const byTopic = new Map<string, DealSignal[]>();
      for (const s of recent) {
        const path = String(s.attrs.path ?? "");
        if (/compare|vs-|alternative/i.test(path)) continue; // competitor rule owns these
        const topic = topicForPath(path);
        if (!topic) continue; // untargeted pages are digest noise, not alerts
        byTopic.set(topic.id, [...(byTopic.get(topic.id) ?? []), s]);
      }
      const alerts: DealAlert[] = [];
      for (const [topicId, group] of byTopic) {
        const topic = CONVERSATION_TOPICS.find((t) => t.id === topicId)!;
        const visits = group.reduce((n, s) => n + (Number(s.attrs.count) || 1), 0);
        const context = contextFor(topic, ctx.transcript);
        const severity: AlertSeverity =
          visits >= 3 && context ? "hot" : context ? "high" : visits >= 3 ? "watch" : "info";
        const pages = [...new Set(group.map((s) => String(s.attrs.path)))].join(", ");
        alerts.push(
          mkAlert(
            this.id,
            severity,
            "buying_intent",
            `${topic.label} pages: ${visits} visit${visits === 1 ? "" : "s"} this week`,
            context
              ? `${ctx.company} is on ${pages} — the same topic they raised on the call.`
              : `${ctx.company} is on ${pages}.`,
            PLAY_BY_TOPIC[topic.id] ?? "Reference this interest in the next touch.",
            group,
            context,
          ),
        );
      }
      return alerts;
    },
  },
  {
    id: "competitor_page_research",
    signalType: "website_visit",
    evaluate(signals, ctx) {
      const compare = signals.filter((s) => /compare|vs-|alternative/i.test(String(s.attrs.path ?? "")));
      if (compare.length === 0) return [];
      const context = contextFor(
        CONVERSATION_TOPICS.find((t) => t.id === "proof") ?? null,
        ctx.transcript,
      );
      return [
        mkAlert(
          this.id,
          "hot",
          "buying_intent",
          "Actively comparing you against alternatives",
          `${ctx.company} viewed ${[...new Set(compare.map((s) => String(s.attrs.path)))].join(", ")} — they are building the shortlist right now.`,
          "Get the differentiation one-pager and a matching customer story in front of them today — whoever frames the comparison wins it.",
          compare,
          context,
        ),
      ];
    },
  },
  {
    // The declarative example: a support ticket lands mid-deal. If the ticket
    // is about the very pain they are evaluating you to fix, that is a fire.
    id: "support_ticket_mid_deal",
    signalType: "support_ticket",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => String(s.attrs.status) !== "resolved")
        .map((s) => {
          const escalated = String(s.attrs.status) === "escalated";
          const text = `${s.summary} ${String(s.attrs.body ?? "")}`;
          const topic = topicForText(text);
          const context = contextFor(topic, ctx.transcript);
          return mkAlert(
            this.id,
            escalated || context ? "hot" : "high",
            "risk",
            `Support ticket ${escalated ? "escalated" : "open"} mid-deal: ${s.summary}`,
            context
              ? `The ticket touches ${context.topicLabel.toLowerCase()} — the exact pain they raised on the call. If the trial reproduces their problem, the deal dies on proof.`
              : `An unresolved ticket during evaluation shapes the buying decision more than any demo.`,
            "AE joins the ticket today: get an engineer on it, then turn the fix into the proof point — 'you saw it break, here is how fast we fix'. Do not let support close it silently.",
            [s],
            context,
            "resolves when the ticket closes with the AE looped in",
          );
        });
    },
  },
  {
    id: "proposal_unopened",
    signalType: "email_event",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => String(s.attrs.kind) === "not_opened" && Number(s.attrs.daysSince ?? 0) >= 3)
        .map((s) =>
          mkAlert(
            this.id,
            "watch",
            "stalled",
            `Proposal unopened for ${s.attrs.daysSince} days`,
            `${ctx.company} has not opened "${s.summary}".`,
            "Re-send with a subject line built from their own words on the call, and ask your contact directly whether the priority changed.",
            [s],
            null,
            "resolves when the proposal is opened",
          ),
        );
    },
  },
  {
    // Gone dark — thresholds widen with deal size (a small deal that goes
    // quiet for a week is gone; an enterprise deal often just is that slow).
    // Reference points: Gong ships 7/14/7-day no-activity and 4/7/4-day
    // ghosted defaults tuned by cycle length; ours scale by deal value.
    id: "gone_dark",
    signalType: "inactivity",
    evaluate(signals, ctx) {
      const threshold =
        ctx.dealValueUsd == null ? 10 : ctx.dealValueUsd < 5_000 ? 7 : ctx.dealValueUsd < 50_000 ? 10 : 14;
      return signals
        .filter((s) => Number(s.attrs.daysSince ?? 0) >= threshold)
        .map((s) =>
          mkAlert(
            this.id,
            "high",
            "stalled",
            `No activity for ${s.attrs.daysSince} days`,
            `Last touch: ${String(s.attrs.lastActivity ?? "unknown")}.`,
            "Revive with the strongest quantified pain from the call — restate their number back to them and offer one concrete new thing (not 'checking in').",
            [s],
            null,
            "resolves on any prospect reply, call, or meeting",
          ),
        );
    },
  },
  {
    id: "commitment_overdue",
    signalType: "commitment",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => String(s.attrs.status) === "overdue")
        .map((s) => {
          const repSide = String(s.attrs.owner) === "rep";
          const lineId = String(s.attrs.sourceLineId ?? "");
          const line = ctx.transcript.find((l) => l.id === lineId);
          const context: SignalContext | null = line
            ? {
                topicId: "commitment",
                topicLabel: "Commitment on the call",
                evidence: [gatedQuoteFromLine(line, 0)].filter((q) => q.status !== "uncorroborated"),
              }
            : null;
          return mkAlert(
            this.id,
            repSide ? "high" : "watch",
            repSide ? "risk" : "stalled",
            `${repSide ? "Your" : "Buyer"} commitment overdue: ${s.attrs.promise}`,
            repSide
              ? "Right now the blocker on this deal is on your side of the table."
              : "A buyer who stops delivering on their own commitments is telling you the priority slipped.",
            repSide
              ? "Deliver it today and say so plainly — promised-and-late is recoverable, promised-and-silent is not."
              : "Re-ask with a smaller version of the same commitment and read the response as qualification data.",
            [s],
            context,
          );
        });
    },
  },
  {
    id: "champion_left",
    signalType: "stakeholder_change",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => String(s.attrs.change) === "left")
        .map((s) =>
          mkAlert(
            this.id,
            "hot",
            "risk",
            `${s.attrs.person} has left ${ctx.company}`,
            "Your relationship map just lost its anchor — single-threaded deals die here.",
            "Multi-thread within 48 hours: ask remaining contacts who inherits this, and re-open with the business case (not the relationship).",
            [s],
            null,
          ),
        );
    },
  },
  {
    id: "new_stakeholder",
    signalType: "stakeholder_change",
    evaluate(signals) {
      return signals
        .filter((s) => String(s.attrs.change) === "new")
        .map((s) =>
          mkAlert(
            this.id,
            "watch",
            "momentum",
            `New stakeholder: ${s.attrs.person}`,
            `A new voice joined the evaluation${s.attrs.role ? ` (${s.attrs.role})` : ""}.`,
            "Tailor the next touch to their KPI before someone else frames you for them.",
            [s],
            null,
          ),
        );
    },
  },
  {
    // Severity is stage-dependent per Gong Labs: competitive discussion EARLY
    // in the cycle correlates with ~49% higher close rates (a healthy,
    // considered deal); a competitor first appearing LATE is the risk case.
    id: "competitor_mention",
    signalType: "competitor_mention",
    evaluate(signals, ctx) {
      return signals.map((s) => {
        const early = String(s.attrs.stage ?? "") === "early";
        const context = contextFor(
          CONVERSATION_TOPICS.find((t) => t.id === "proof") ?? null,
        ctx.transcript,
        );
        return mkAlert(
          this.id,
          early ? "watch" : "high",
          early ? "momentum" : "risk",
          `${s.attrs.competitor} mentioned in ${s.attrs.where}${early ? " (early stage)" : ""}`,
          early
            ? `Early competitive discussion is a buying signal — ${ctx.company} is evaluating seriously, not browsing.`
            : `${ctx.company} brought up ${s.attrs.competitor} late in the cycle — someone is building an alternative case.`,
          early
            ? "Shape the decision criteria now, while they are still being written."
            : "Position against what they LIKE about the rival, not a generic teardown — and plant one criterion you win outright.",
          [s],
          context,
        );
      });
    },
  },
  {
    // Threading health. Gong Labs: won deals carry ~67% more contacts than
    // lost; Ebsta (3.2M opps): win rate peaks at 7-12 relationships and falls
    // off past ~16. Zero senior contacts near close is Gong's "No Power".
    id: "threading_health",
    signalType: "relationship_stats",
    evaluate(signals) {
      return signals.flatMap((s) => {
        const contacts = Number(s.attrs.contacts ?? 0);
        const senior = s.attrs.seniorContacts == null ? null : Number(s.attrs.seniorContacts);
        if (senior === 0) {
          return [
            mkAlert(
              this.id,
              "hot",
              "risk",
              "No one senior in the deal",
              `${contacts} contact${contacts === 1 ? "" : "s"} engaged and none above the power line — deals without power slip at the signature.`,
              "Use the next artifact as the reason for an executive touch: ask your contact to bring their boss to review it together.",
              [s],
              null,
              "resolves when a senior stakeholder joins a call or thread",
            ),
          ];
        }
        if (contacts > 0 && contacts < 3) {
          return [
            mkAlert(
              this.id,
              "high",
              "risk",
              `Single-threaded (${contacts} contact${contacts === 1 ? "" : "s"})`,
              "Won deals carry roughly two-thirds more contacts than lost ones; one relationship is a deal on one thread of rope.",
              "Ask for one specific extra person, not 'others': the day-to-day user, the admin, or the person who owns the number this helps.",
              [s],
              null,
              "resolves when the deal reaches 3+ engaged contacts",
            ),
          ];
        }
        if (contacts >= 16) {
          return [
            mkAlert(
              this.id,
              "watch",
              "stalled",
              `Over-threaded (${contacts} contacts)`,
              "Past ~16 people, win rates fall — a committee this wide usually means nobody owns the decision.",
              "Find the actual decision path: ask your champion which three people in this crowd can kill it and which one signs.",
              [s],
              null,
            ),
          ];
        }
        return [];
      });
    },
  },
  {
    // Deal age vs typical cycle: ~1 month past optimum costs up to 60% of
    // close likelihood; deals older than 2x the average cycle close ~3%.
    id: "deal_age",
    signalType: "deal_age",
    evaluate(signals) {
      return signals.flatMap((s) => {
        const days = Number(s.attrs.daysOpen ?? 0);
        const typical = Number(s.attrs.typicalCycleDays ?? 0);
        if (!days || !typical) return [];
        const ratio = days / typical;
        if (ratio < 1.2) return [];
        const critical = ratio >= 2;
        return [
          mkAlert(
            this.id,
            critical ? "hot" : "high",
            "stalled",
            `Deal is ${ratio.toFixed(1)}x the typical cycle (${days} days open)`,
            critical
              ? "Deals past twice the average cycle close about 3% of the time — this one needs a reset, not another follow-up."
              : "Every month past the optimum cycle costs a large share of close likelihood.",
            critical
              ? "Requalify from zero with the buyer: is this still real, what changed, and what would need to be true to decide this quarter — or close it lost and free the time."
              : "Compress the remaining path: propose collapsing the next two steps into one working session with every needed approver present.",
            [s],
            null,
            "resolves on a stage advance or an agreed close plan",
          ),
        ];
      });
    },
  },
  {
    // The highest-evidence signal in the research: engagement REGRESSION.
    // Ebsta (3.2M opps): deals whose relationship score fell from the top band
    // saw win rates drop 47% and cycles lengthen 81%.
    id: "engagement_regression",
    signalType: "engagement_score",
    evaluate(signals, ctx) {
      return signals.flatMap((s) => {
        const score = Number(s.attrs.score ?? NaN);
        const prev = Number(s.attrs.previous ?? NaN);
        if (!Number.isFinite(score) || !Number.isFinite(prev)) return [];
        const dropped = prev - score >= 20 || (prev > 80 && score <= 80);
        if (!dropped) return [];
        return [
          mkAlert(
            this.id,
            "hot",
            "risk",
            `Engagement regressed (${prev} → ${score})`,
            `${ctx.company} was leaning in and is now pulling back — engagement decline is the single strongest deal-risk indicator in the benchmark data.`,
            "Treat it as a change event, not a lull: call the champion and ask directly what changed on their side this week.",
            [s],
            null,
            "resolves when engagement returns to its prior band",
          ),
        ];
      });
    },
  },
  {
    // Risk language in a buyer email (the Gong "Red Flag" analog): budget
    // cuts, disengaged decision-maker, project deprioritized.
    id: "risk_language",
    signalType: "email_event",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => String(s.attrs.kind) === "risk_language")
        .map((s) =>
          mkAlert(
            this.id,
            "high",
            "risk",
            `Risk language in email: ${s.summary}`,
            `${ctx.company} used language that usually precedes a slip — budget, priority, or decision-maker interest shifting.`,
            "Reply the same day and name it plainly: acknowledge the constraint they raised and offer the smaller path that survives it.",
            [s],
            null,
            "resolves when you reply or the sender joins a call",
          ),
        );
    },
  },
  {
    id: "usage_shift",
    signalType: "usage",
    evaluate(signals, ctx) {
      return signals.map((s) => {
        const drop = String(s.attrs.direction) === "drop";
        return mkAlert(
          this.id,
          drop ? "high" : "watch",
          drop ? "risk" : "momentum",
          `Trial usage ${drop ? "dropped" : "spiked"}${s.attrs.pct ? ` ${s.attrs.pct}%` : ""} (${s.attrs.metric})`,
          drop
            ? `${ctx.company} is quietly disengaging from the product before they tell you.`
            : `${ctx.company} is leaning in — usage is the most honest buying signal there is.`,
          drop
            ? "Call the day-to-day user (not the buyer): find the friction, fix it live, then tell the buyer what changed."
            : "Convert momentum into a commercial step this week while the value is felt.",
          [s],
          null,
        );
      });
    },
  },
  {
    id: "company_news",
    signalType: "company_news",
    evaluate(signals, ctx) {
      return signals.map((s) => {
        const kind = String(s.attrs.kind);
        const positive = kind === "funding" || kind === "hiring";
        return mkAlert(
          this.id,
          "watch",
          positive ? "momentum" : "risk",
          `${ctx.company}: ${s.summary}`,
          positive
            ? "New budget and new initiatives are being allocated right now."
            : "Budget scrutiny usually follows — the business case needs to be airtight.",
          positive
            ? "Tie the deal to the initiative the news funds, and congratulate the exec who owns it."
            : "Re-anchor on hard-dollar payback and offer a smaller first commitment.",
          [s],
          null,
        );
      });
    },
  },
  {
    // Incumbent renewal approaching = the single best switch window there is.
    id: "renewal_window",
    signalType: "renewal_window",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => Number(s.attrs.daysUntil ?? 999) <= 45)
        .map((s) => {
          const context = contextFor(
            CONVERSATION_TOPICS.find((t) => t.id === "pricing") ?? null,
            ctx.transcript,
          );
          return mkAlert(
            this.id,
            "hot",
            "buying_intent",
            `${s.attrs.vendor ?? "Incumbent"} renewal in ${s.attrs.daysUntil} days`,
            `The cheapest moment to switch is before ${ctx.company} signs another year.`,
            "Build the reverse timeline from the renewal date TODAY — decision, security, go-live — and put it in front of the buyer as a mutual plan.",
            [s],
            context,
          );
        });
    },
  },
  {
    id: "meeting_events",
    signalType: "meeting_event",
    evaluate(signals, ctx) {
      return signals.flatMap((s) => {
        const kind = String(s.attrs.kind);
        if (kind === "no_show") {
          return [
            mkAlert(
              this.id,
              "high",
              "stalled",
              "Meeting no-show",
              `${ctx.company} missed ${String(s.attrs.label ?? "the meeting")} without rescheduling.`,
              "One no-show is life; re-book same-day with a sharper agenda. Two is qualification data.",
              [s],
              null,
            ),
          ];
        }
        if (kind === "booked") {
          return [
            mkAlert(
              this.id,
              "info",
              "momentum",
              `Meeting booked: ${String(s.attrs.label ?? s.summary)}`,
              "Forward motion on the calendar.",
              "Send a one-line agenda tied to what they said they wanted to see.",
              [s],
              null,
            ),
          ];
        }
        return [];
      });
    },
  },
  {
    id: "stage_regressed",
    signalType: "stage_change",
    evaluate(signals, ctx) {
      return signals
        .filter((s) => String(s.attrs.direction) === "regressed")
        .map((s) =>
          mkAlert(
            this.id,
            "high",
            "risk",
            `Deal moved back: ${s.attrs.from} → ${s.attrs.to}`,
            `Something changed inside ${ctx.company} that the pipeline just caught up with.`,
            "Ask the champion directly what changed — guessing burns the time you need to respond to the real reason.",
            [s],
            null,
          ),
        );
    },
  },
];

// ── Engine ──────────────────────────────────────────────────────────────────

export type DealSignalInput = {
  company: string;
  transcript: TranscriptLine[];
  signals: DealSignal[];
  dealValueUsd?: number | null;
  /** ISO now, injectable for determinism. */
  now?: string;
  mode?: "demo" | "live";
};

/** Typed + versioned output (issue #2 invariant: no dynamic-keys objects). */
export const FEED_SCHEMA = "opengong.deal-signal-feed";
export const FEED_VERSION = 1;
/** Bump when SIGNAL_RULES change behavior — consumers can pin. */
export const RULES_VERSION = 2;

export type DealSignalFeed = {
  schema: typeof FEED_SCHEMA;
  version: typeof FEED_VERSION;
  rulesVersion: typeof RULES_VERSION;
  /** Provenance label: "demo" replays the fixture; "live" evaluated real input. */
  mode: "demo" | "live";
  company: string;
  generatedAt: string;
  dealValueUsd: number | null;
  alerts: DealAlert[];
  /** Alerts suppressed below the deal-size severity floor. */
  suppressed: DealAlert[];
};

/** Small deals see only urgent alerts; the rest lands in the digest. */
function severityFloor(dealValueUsd: number | null): AlertSeverity {
  if (dealValueUsd == null) return "watch";
  if (dealValueUsd < 5_000) return "high";
  if (dealValueUsd < 50_000) return "watch";
  return "info";
}

export function evaluateDealSignals(input: DealSignalInput): DealSignalFeed {
  const signals = DealSignalSchema.array().parse(input.signals);
  const now = input.now ?? new Date().toISOString();
  const ctx: RuleCtx = {
    company: input.company,
    transcript: input.transcript,
    dealValueUsd: input.dealValueUsd ?? null,
    nowMs: Date.parse(now),
  };

  const byType = new Map<SignalType, DealSignal[]>();
  for (const s of signals.filter((s) => s.company === input.company)) {
    byType.set(s.type, [...(byType.get(s.type) ?? []), s]);
  }

  const all: DealAlert[] = [];
  for (const rule of SIGNAL_RULES) {
    const group = byType.get(rule.signalType) ?? [];
    if (group.length > 0) all.push(...rule.evaluate(group, ctx));
  }

  all.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      Date.parse(b.signals[0]?.at ?? "0") - Date.parse(a.signals[0]?.at ?? "0"),
  );

  const floor = SEVERITY_ORDER[severityFloor(ctx.dealValueUsd)];
  return {
    schema: FEED_SCHEMA,
    version: FEED_VERSION,
    rulesVersion: RULES_VERSION,
    mode: input.mode ?? "live",
    company: input.company,
    generatedAt: now,
    dealValueUsd: ctx.dealValueUsd,
    alerts: all.filter((a) => SEVERITY_ORDER[a.severity] <= floor),
    suppressed: all.filter((a) => SEVERITY_ORDER[a.severity] > floor),
  };
}

// ── Render + CRM push payload ───────────────────────────────────────────────

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  hot: "🔥 hot",
  high: "🔴 high",
  watch: "🟡 watch",
  info: "⚪ info",
};

export function renderSignalFeed(feed: DealSignalFeed): string {
  const lines: string[] = [];
  lines.push(`# Deal signals — ${feed.company}`);
  lines.push("");
  lines.push(
    `${feed.alerts.length} alert${feed.alerts.length === 1 ? "" : "s"}${feed.suppressed.length ? ` (+${feed.suppressed.length} below the noise floor for this deal size)` : ""}`,
  );
  for (const a of feed.alerts) {
    lines.push("");
    lines.push(`## ${SEVERITY_BADGE[a.severity]} · ${a.title}`);
    lines.push(a.detail);
    if (a.evidenceState === "cited" && a.context) {
      for (const e of a.context.evidence) {
        lines.push(`> "${e.quote}" [${e.lineId}]`);
      }
    } else {
      lines.push(`_no call evidence for this one — signal only_`);
    }
    lines.push(`**Play:** ${a.play}`);
    if (a.resolvesWhen) lines.push(`_${a.resolvesWhen}_`);
    if (a.push) lines.push(`_→ pushed to CRM as a task_`);
  }
  return lines.join("\n");
}

/** Shape ready for a HubSpot/Factors task-creation wiring (declared, not wired). */
export function toCrmTaskPayload(alert: DealAlert, company: string): {
  type: "task";
  title: string;
  body: string;
  priority: "HIGH" | "MEDIUM";
  companyHint: string;
} {
  const evidence =
    alert.context?.evidence.map((e) => `"${e.quote}" [${e.lineId}]`).join(" · ") ?? "";
  return {
    type: "task",
    title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    body: `${alert.detail}${evidence ? `\nCall evidence: ${evidence}` : ""}\nPlay: ${alert.play}`,
    priority: alert.severity === "hot" ? "HIGH" : "MEDIUM",
    companyHint: company,
  };
}

// ── Keyless demo (Brightsmile: the deal from the sample arc) ────────────────
// Frozen `now` keeps the demo deterministic. Every contextual alert cites a
// real line from sample-calls/brightsmile-01-discovery.json through the gate.

export const DEMO_SIGNALS_NOW = "2026-08-13T12:00:00Z";

export const DEMO_DEAL_SIGNALS: DealSignal[] = [
  { type: "website_visit", company: "Brightsmile Dental Group", at: "2026-08-11T09:14:00Z", summary: "Viewed /pricing", attrs: { path: "/pricing", count: 1 } },
  { type: "website_visit", company: "Brightsmile Dental Group", at: "2026-08-12T16:40:00Z", summary: "Viewed /pricing", attrs: { path: "/pricing", count: 2 } },
  { type: "website_visit", company: "Brightsmile Dental Group", at: "2026-08-12T16:47:00Z", summary: "Viewed /compliance/sms-tcpa", attrs: { path: "/compliance/sms-tcpa", count: 1 } },
  { type: "website_visit", company: "Brightsmile Dental Group", at: "2026-08-13T08:05:00Z", summary: "Viewed /compare/ringhawk-alternative", attrs: { path: "/compare/ringhawk-alternative", count: 1 } },
  { type: "website_visit", company: "Brightsmile Dental Group", at: "2026-08-10T11:00:00Z", summary: "Viewed /blog/front-desk-tips", attrs: { path: "/blog/front-desk-tips", count: 1 } },
  { type: "support_ticket", company: "Brightsmile Dental Group", at: "2026-08-12T18:22:00Z", summary: "Trial: after-hours routing rule not saving", attrs: { status: "escalated", body: "set up the after hours routing rule twice and calls still ring out to voicemail overnight" } },
  { type: "email_event", company: "Brightsmile Dental Group", at: "2026-08-09T10:00:00Z", summary: "Proposal — Brightsmile rollout", attrs: { kind: "not_opened", daysSince: 4 } },
  { type: "commitment", company: "Brightsmile Dental Group", at: "2026-08-12T00:00:00Z", summary: "Rep commitment from discovery call", attrs: { owner: "rep", promise: "Send the compliant-texting one-pager before Thursday", due: "2026-08-12", status: "overdue", sourceLineId: "L16" } },
  { type: "renewal_window", company: "Brightsmile Dental Group", at: "2026-08-13T00:00:00Z", summary: "RingHawk contract renewal approaching", attrs: { vendor: "RingHawk", daysUntil: 30 } },
  { type: "meeting_event", company: "Brightsmile Dental Group", at: "2026-08-13T09:00:00Z", summary: "Demo booked", attrs: { kind: "booked", label: "Thursday demo — routing + compliant texting" } },
  { type: "relationship_stats", company: "Brightsmile Dental Group", at: "2026-08-13T09:00:00Z", summary: "1 engaged contact (Rahul)", attrs: { contacts: 1 } },
];

export function demoDealSignalFeed(transcript: TranscriptLine[]): DealSignalFeed {
  return evaluateDealSignals({
    company: "Brightsmile Dental Group",
    transcript,
    signals: DEMO_DEAL_SIGNALS,
    dealValueUsd: 30_000,
    now: DEMO_SIGNALS_NOW,
    mode: "demo",
  });
}
