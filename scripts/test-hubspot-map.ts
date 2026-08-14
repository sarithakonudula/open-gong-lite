import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DealAlert } from "../src/lib/deal-signals";
import {
  AI_DEAL_PROPERTIES,
  alertToTaskProperties,
  momentumToDealProperties,
  textToNoteHtml,
} from "../src/lib/hubspot";
import { computeMomentum } from "../src/lib/momentum";
import type { DealNotes } from "../src/lib/types";

const notes: DealNotes = {
  title: "Test",
  summary: [{ text: "s", evidence: { lineId: "L1", quote: "q" }, status: "verified" }],
  objections: [],
  intent: [{ text: "buying", evidence: { lineId: "L2", quote: "q2" }, status: "verified" }],
  nextSteps: [{ text: "Demo Thursday", evidence: { lineId: "L3", quote: "q3" }, status: "verified" }],
  pain: [],
  pricing: [],
  competitors: [],
  followUpEmail: {
    subject: "s",
    body: "b",
    evidence: { lineId: "L1", quote: "q" },
    status: "verified",
  },
};

const alert: DealAlert = {
  id: "a1",
  ruleId: "inactivity",
  severity: "hot",
  direction: "risk",
  title: "Deal gone quiet",
  detail: "No activity for 14 days",
  play: "Send the recap they were promised",
  signals: [],
  context: null,
  evidenceState: "signal_only",
  resolvesWhen: null,
  push: true,
};

describe("hubspot mapping", () => {
  it("momentum maps onto every ai_* property we create", () => {
    const props = momentumToDealProperties(computeMomentum(notes), "2026-08-14T00:00:00Z");
    for (const p of AI_DEAL_PROPERTIES) {
      assert.ok(p.name in props, `missing ${p.name}`);
    }
    assert.equal(props.ai_momentum_direction, "advancing");
    assert.equal(props.ai_next_action, "Demo Thursday");
    assert.match(props.ai_momentum_score, /^\d+$/);
  });

  it("hot alerts become HIGH-priority open tasks", () => {
    const props = alertToTaskProperties(alert, "Acme", "2026-08-14T00:00:00Z");
    assert.equal(props.hs_task_priority, "HIGH");
    assert.equal(props.hs_task_status, "NOT_STARTED");
    assert.match(props.hs_task_subject, /\[HOT\] Deal gone quiet/);
    assert.match(props.hs_task_body, /Send the recap/);
  });

  it("note html escapes markup and keeps line breaks", () => {
    const html = textToNoteHtml("a <script>x</script>\nb & c");
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /a &lt;script&gt;/);
    assert.match(html, /<br>/);
    assert.match(html, /b &amp; c/);
  });
});
