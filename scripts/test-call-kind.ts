import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectCallKind,
  KIND_DEFAULT_PACK,
} from "../src/lib/call-kind";
import { buildDigest } from "../src/lib/digest";
import { getMethodologyPack } from "../src/lib/methodology";
import type { DealNotes, RunRecord, TranscriptLine } from "../src/lib/types";

function lines(texts: string[]): TranscriptLine[] {
  return texts.map((text, i) => ({
    id: `L${i + 1}`,
    index: i,
    speaker: i % 2 === 0 ? "Agent" : "Customer",
    text,
  }));
}

const SUPPORT_CALL = lines([
  "Thanks for calling in — I see you opened ticket 4821 this morning.",
  "Yes, the export keeps failing with an error code since yesterday.",
  "Let's troubleshoot this together — can you reproduce it while I watch the logs?",
  "Sure, it just crashed again with a timeout.",
  "Okay, I'll escalate this as a sev-2 with the repro steps if the workaround doesn't hold.",
]);

const CS_CALL = lines([
  "Ahead of your renewal in March I pulled the usage data for the quarter.",
  "Great — adoption has been on my mind since the onboarding wrapped.",
  "Active users are up but the scheduling module dropped — let's put that in the success plan.",
  "We're also opening a second clinic, so we may need additional seats.",
  "Perfect, I'll bring an expansion option to the next business review.",
]);

const SALES_CALL = lines([
  "Thanks for the demo last week — we're evaluating you against one competitor.",
  "Happy to walk through pricing and get you a proposal.",
  "Budget-wise we'd need sign-off from procurement before the trial converts.",
]);

describe("call-kind detection", () => {
  it("classifies a support call with receipts", () => {
    const r = detectCallKind(SUPPORT_CALL);
    assert.equal(r.kind, "support");
    assert.equal(r.confidence, "high");
    assert.ok(r.markers.length >= 3);
    assert.ok(r.markers.every((m) => /^L\d+$/.test(m.lineId)));
  });

  it("classifies a customer-success call", () => {
    const r = detectCallKind(CS_CALL);
    assert.equal(r.kind, "customer_success");
    assert.equal(r.confidence, "high");
  });

  it("classifies a sales call", () => {
    const r = detectCallKind(SALES_CALL);
    assert.equal(r.kind, "sales");
  });

  it("defaults to sales at low confidence when there is no signal", () => {
    const r = detectCallKind(lines(["Hello.", "Hi, how are you?"]));
    assert.equal(r.kind, "sales");
    assert.equal(r.confidence, "low");
    assert.equal(r.markers.length, 0);
    assert.equal(detectCallKind([]).kind, "sales");
  });

  it("kind defaults route to real packs with coaching content", () => {
    for (const packId of Object.values(KIND_DEFAULT_PACK)) {
      const pack = getMethodologyPack(packId);
      assert.ok(pack, `missing pack ${packId}`);
      for (const trait of pack!.traits) {
        assert.ok(trait.coaching.example_line.length > 0);
      }
    }
    assert.equal(getMethodologyPack("support_excellence")!.traits.length, 8);
    assert.equal(getMethodologyPack("customer_success")!.traits.length, 8);
  });
});

// ── Digest gating: non-sales calls carry no deal momentum ───────────────────

function notes(): DealNotes {
  return {
    title: "Call",
    summary: [{ text: "s", evidence: { lineId: "L1", quote: "q" }, status: "verified" }],
    objections: [],
    intent: [{ text: "i", evidence: { lineId: "L1", quote: "q" }, status: "verified" }],
    nextSteps: [{ text: "n", evidence: { lineId: "L1", quote: "q" }, status: "verified" }],
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
}

function run(id: string, company: string, transcript: TranscriptLine[]): RunRecord {
  return {
    id,
    createdAt: "2026-08-14T00:00:00Z",
    updatedAt: "2026-08-14T00:00:00Z",
    status: "shipped",
    source: "upload",
    sourceLabel: company,
    shareToken: "t",
    transcript,
    notes: notes(),
    attempts: [],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
  };
}

describe("kind-aware digest", () => {
  it("momentum only for sales; support/CS entries carry the kind instead", () => {
    const digest = buildDigest(
      [
        run("a", "SalesCo", SALES_CALL),
        run("b", "TicketCo", SUPPORT_CALL),
        run("c", "RenewCo", CS_CALL),
      ],
      { companyForRun: (r) => r.sourceLabel, now: "2026-08-14T00:00:00Z" },
    );
    const byCompany = Object.fromEntries(digest.entries.map((e) => [e.company, e]));
    assert.ok(byCompany.SalesCo!.momentum);
    assert.equal(byCompany.TicketCo!.momentum, null);
    assert.equal(byCompany.TicketCo!.callKind, "support");
    assert.equal(byCompany.RenewCo!.momentum, null);
    assert.equal(byCompany.RenewCo!.callKind, "customer_success");
    assert.match(digest.markdown, /TicketCo — Support call/);
    assert.match(digest.markdown, /RenewCo — Customer Success call/);
  });
});
