import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DealSignalSchema,
  DEMO_DEAL_SIGNALS,
  DEMO_SIGNALS_NOW,
  demoDealSignalFeed,
  evaluateDealSignals,
  normalizeVisits,
  renderSignalFeed,
  toCrmTaskPayload,
  topicForPath,
  topicForText,
} from "../src/lib/deal-signals";
import type { TranscriptLine } from "../src/lib/types";

const brightsmile = JSON.parse(
  readFileSync(new URL("../sample-calls/brightsmile-01-discovery.json", import.meta.url), "utf8"),
) as { transcript: TranscriptLine[] };

describe("signal inputs", () => {
  it("demo signals validate against the schema", () => {
    for (const s of DEMO_DEAL_SIGNALS) DealSignalSchema.parse(s);
  });

  it("normalizeVisits adapts vendor-shaped rows", () => {
    const out = normalizeVisits(
      [
        { page: "https://justcall.io/pricing", timestamp: "2026-08-12T10:00:00Z", visits: 2 },
        { path: "/compliance/sms-tcpa", at: "2026-08-12T11:00:00Z" },
        { notAPath: true },
      ],
      "Acme",
    );
    assert.equal(out.length, 2);
    assert.equal(out[0].attrs.path, "/pricing");
    assert.equal(out[0].attrs.count, 2);
    assert.equal(out[0].company, "Acme");
  });
});

describe("conversation context", () => {
  it("maps pages and ticket text to discussion topics", () => {
    assert.equal(topicForPath("/pricing")?.id, "pricing");
    assert.equal(topicForPath("/compliance/sms-tcpa")?.id, "compliance");
    assert.equal(topicForPath("/blog/front-desk-tips"), null);
    assert.equal(
      topicForText("after hours routing rule not saving calls still ring out")?.id,
      "reliability",
    );
  });
});

describe("demo feed (Brightsmile, one week after discovery)", () => {
  const feed = demoDealSignalFeed(brightsmile.transcript);

  it("produces hot alerts for pricing intent, ticket, comparison page, renewal", () => {
    const hot = feed.alerts.filter((a) => a.severity === "hot").map((a) => a.ruleId);
    assert.ok(hot.includes("intent_page_activity"), "pricing surge should be hot");
    assert.ok(hot.includes("support_ticket_mid_deal"), "escalated contextual ticket should be hot");
    assert.ok(hot.includes("competitor_page_research"));
    assert.ok(hot.includes("renewal_window"));
  });

  it("the support ticket alert cites the after-hours pain from the call", () => {
    const ticket = feed.alerts.find((a) => a.ruleId === "support_ticket_mid_deal")!;
    assert.equal(ticket.context?.topicId, "reliability");
    assert.ok(ticket.context!.evidence.length > 0);
    for (const e of ticket.context!.evidence) {
      assert.notEqual(e.status, "uncorroborated", "signal evidence must survive the gate");
      assert.ok(
        brightsmile.transcript.some((l) => l.id === e.lineId && l.text.includes(e.quote)),
        `quote must be verbatim from ${e.lineId}`,
      );
    }
  });

  it("pricing intent carries the buyer's own pricing pushback as evidence", () => {
    const pricing = feed.alerts.find(
      (a) => a.ruleId === "intent_page_activity" && a.context?.topicId === "pricing",
    )!;
    assert.ok(pricing.context!.evidence.some((e) => /expensive|budget/i.test(e.quote)));
  });

  it("aggregates pageviews — one alert per topic, not per visit", () => {
    const intentAlerts = feed.alerts.filter((a) => a.ruleId === "intent_page_activity");
    const topics = intentAlerts.map((a) => a.context?.topicId ?? "none");
    assert.equal(new Set(topics).size, topics.length, "no duplicate topic alerts");
  });

  it("mid-size deal suppresses info noise into the digest", () => {
    assert.ok(feed.suppressed.length >= 1, "meeting-booked info alert belongs in the digest");
    assert.ok(feed.alerts.every((a) => a.severity !== "info"));
  });

  it("overdue rep commitment is flagged with the source line", () => {
    const c = feed.alerts.find((a) => a.ruleId === "commitment_overdue")!;
    assert.equal(c.severity, "high");
    assert.equal(c.context?.evidence[0]?.lineId, "L16");
  });
});

describe("noise floor scales with deal size", () => {
  const base = {
    company: "Brightsmile Dental Group",
    transcript: brightsmile.transcript,
    signals: DEMO_DEAL_SIGNALS,
    now: DEMO_SIGNALS_NOW,
  };

  it("transactional deals only surface hot+high; enterprise sees everything", () => {
    const small = evaluateDealSignals({ ...base, dealValueUsd: 3_000 });
    const ent = evaluateDealSignals({ ...base, dealValueUsd: 250_000 });
    assert.ok(small.alerts.every((a) => a.severity === "hot" || a.severity === "high"));
    assert.ok(small.suppressed.length > 0);
    assert.equal(ent.suppressed.length, 0);
    assert.ok(ent.alerts.length > small.alerts.length);
  });
});

describe("rule behaviors", () => {
  const t = brightsmile.transcript;

  it("gone-dark threshold widens with deal size", () => {
    const signal = {
      type: "inactivity" as const,
      company: "X",
      at: DEMO_SIGNALS_NOW,
      summary: "No activity",
      attrs: { daysSince: 8 },
    };
    const small = evaluateDealSignals({ company: "X", transcript: t, signals: [signal], dealValueUsd: 3_000, now: DEMO_SIGNALS_NOW });
    const ent = evaluateDealSignals({ company: "X", transcript: t, signals: [signal], dealValueUsd: 250_000, now: DEMO_SIGNALS_NOW });
    assert.equal(small.alerts.filter((a) => a.ruleId === "gone_dark").length, 1, "8 days is dark for a small deal");
    assert.equal(ent.alerts.concat(ent.suppressed).filter((a) => a.ruleId === "gone_dark").length, 0, "8 days is normal enterprise pace");
  });

  it("champion departure is always hot; resolved tickets never alert", () => {
    const feed = evaluateDealSignals({
      company: "X",
      transcript: t,
      now: DEMO_SIGNALS_NOW,
      signals: [
        { type: "stakeholder_change", company: "X", at: DEMO_SIGNALS_NOW, summary: "Champion left", attrs: { person: "Rahul", change: "left" } },
        { type: "support_ticket", company: "X", at: DEMO_SIGNALS_NOW, summary: "Old issue", attrs: { status: "resolved" } },
      ],
    });
    assert.equal(feed.alerts[0]?.ruleId, "champion_left");
    assert.equal(feed.alerts[0]?.severity, "hot");
    assert.ok(!feed.alerts.concat(feed.suppressed).some((a) => a.ruleId === "support_ticket_mid_deal"));
  });

  it("stale visits outside the 7-day window do not alert", () => {
    const feed = evaluateDealSignals({
      company: "X",
      transcript: t,
      now: DEMO_SIGNALS_NOW,
      signals: [
        { type: "website_visit", company: "X", at: "2026-07-01T00:00:00Z", summary: "Viewed /pricing", attrs: { path: "/pricing", count: 5 } },
      ],
    });
    assert.equal(feed.alerts.length + feed.suppressed.length, 0);
  });
});

describe("outputs", () => {
  it("feed renders with receipts and plays; CRM payload carries evidence", () => {
    const feed = demoDealSignalFeed(brightsmile.transcript);
    const md = renderSignalFeed(feed);
    assert.match(md, /Deal signals — Brightsmile Dental Group/);
    assert.match(md, /🔥 hot/);
    assert.match(md, /\*\*Play:\*\*/);
    assert.match(md, /\[L\d+\]/, "alerts cite transcript lines");
    const hot = feed.alerts.find((a) => a.severity === "hot")!;
    const task = toCrmTaskPayload(hot, feed.company);
    assert.equal(task.priority, "HIGH");
    assert.match(task.title, /^\[HOT\]/);
  });
});

describe("issue #2 invariants", () => {
  const t = brightsmile.transcript;

  it("feed is typed, versioned, and provenance-labeled", () => {
    const feed = demoDealSignalFeed(t);
    assert.equal(feed.schema, "opengong.deal-signal-feed");
    assert.equal(feed.version, 1);
    assert.equal(feed.rulesVersion, 2);
    assert.equal(feed.mode, "demo");
  });

  it("fabrication regression: a dead sourceLineId abstains, never invents a quote", () => {
    const feed = evaluateDealSignals({
      company: "X",
      transcript: t,
      now: DEMO_SIGNALS_NOW,
      signals: [
        {
          type: "commitment",
          company: "X",
          at: DEMO_SIGNALS_NOW,
          summary: "Rep commitment",
          attrs: { owner: "rep", promise: "send doc", status: "overdue", sourceLineId: "L999" },
        },
      ],
    });
    const alert = feed.alerts.find((a) => a.ruleId === "commitment_overdue")!;
    assert.equal(alert.evidenceState, "signal_only");
    assert.equal(alert.context, null);
    const md = renderSignalFeed(feed);
    assert.match(md, /signal only/);
    assert.doesNotMatch(md, /\[L999\]/, "a nonexistent line is never cited");
  });

  it("every cited alert in the demo survives the gate; abstains are explicit", () => {
    const feed = demoDealSignalFeed(t);
    for (const a of feed.alerts.concat(feed.suppressed)) {
      if (a.evidenceState === "cited") {
        assert.ok(a.context && a.context.evidence.length > 0);
        for (const e of a.context.evidence) assert.notEqual(e.status, "uncorroborated");
      } else {
        assert.ok(!a.context || a.context.evidence.length === 0);
      }
    }
  });
});

describe("rules v2 (research-derived)", () => {
  const t = brightsmile.transcript;
  const base = { company: "X", transcript: t, now: DEMO_SIGNALS_NOW };

  it("competitor-mention severity inverts by stage (early is a buying signal)", () => {
    const early = evaluateDealSignals({ ...base, signals: [
      { type: "competitor_mention", company: "X", at: DEMO_SIGNALS_NOW, summary: "RingHawk on call", attrs: { competitor: "RingHawk", where: "call", stage: "early" } },
    ]});
    const late = evaluateDealSignals({ ...base, signals: [
      { type: "competitor_mention", company: "X", at: DEMO_SIGNALS_NOW, summary: "RingHawk in email", attrs: { competitor: "RingHawk", where: "email", stage: "late" } },
    ]});
    const e = early.alerts.concat(early.suppressed).find((a) => a.ruleId === "competitor_mention")!;
    const l = late.alerts.find((a) => a.ruleId === "competitor_mention")!;
    assert.equal(e.severity, "watch");
    assert.equal(e.direction, "momentum");
    assert.equal(l.severity, "high");
    assert.equal(l.direction, "risk");
  });

  it("threading health: single-threaded is high, no-power is hot, over-threaded is watch", () => {
    const single = evaluateDealSignals({ ...base, signals: [
      { type: "relationship_stats", company: "X", at: DEMO_SIGNALS_NOW, summary: "1 contact", attrs: { contacts: 1 } },
    ]});
    assert.equal(single.alerts.find((a) => a.ruleId === "threading_health")?.severity, "high");
    const noPower = evaluateDealSignals({ ...base, signals: [
      { type: "relationship_stats", company: "X", at: DEMO_SIGNALS_NOW, summary: "5 contacts, none senior", attrs: { contacts: 5, seniorContacts: 0 } },
    ]});
    assert.equal(noPower.alerts.find((a) => a.ruleId === "threading_health")?.severity, "hot");
    const wide = evaluateDealSignals({ ...base, signals: [
      { type: "relationship_stats", company: "X", at: DEMO_SIGNALS_NOW, summary: "18 contacts", attrs: { contacts: 18 } },
    ]});
    assert.equal(wide.alerts.concat(wide.suppressed).find((a) => a.ruleId === "threading_health")?.severity, "watch");
  });

  it("deal age escalates: 1.2x cycle is high, 2x cycle is hot; healthy age is silent", () => {
    const mk = (daysOpen: number) => evaluateDealSignals({ ...base, signals: [
      { type: "deal_age", company: "X", at: DEMO_SIGNALS_NOW, summary: "Deal age", attrs: { daysOpen, typicalCycleDays: 30 } },
    ]});
    assert.equal(mk(20).alerts.length + mk(20).suppressed.length, 0);
    assert.equal(mk(40).alerts.find((a) => a.ruleId === "deal_age")?.severity, "high");
    assert.equal(mk(65).alerts.find((a) => a.ruleId === "deal_age")?.severity, "hot");
  });

  it("engagement regression from the top band is hot", () => {
    const feed = evaluateDealSignals({ ...base, signals: [
      { type: "engagement_score", company: "X", at: DEMO_SIGNALS_NOW, summary: "Weekly engagement", attrs: { score: 74, previous: 88 } },
    ]});
    assert.equal(feed.alerts.find((a) => a.ruleId === "engagement_regression")?.severity, "hot");
  });

  it("risk-language emails alert high with an auto-resolve condition", () => {
    const feed = evaluateDealSignals({ ...base, signals: [
      { type: "email_event", company: "X", at: DEMO_SIGNALS_NOW, summary: "Budget under review this quarter", attrs: { kind: "risk_language" } },
    ]});
    const a = feed.alerts.find((x) => x.ruleId === "risk_language")!;
    assert.equal(a.severity, "high");
    assert.match(a.resolvesWhen ?? "", /reply|call/);
  });

  it("demo now includes the single-threading alert with resolution condition", () => {
    const feed = demoDealSignalFeed(t);
    const threading = feed.alerts.find((a) => a.ruleId === "threading_health")!;
    assert.equal(threading.severity, "high");
    assert.match(threading.resolvesWhen ?? "", /3\+ engaged contacts/);
  });
});
