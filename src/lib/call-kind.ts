// Call-kind detection — sales / support / customer success.
//
// A shared recording can be any of the three, and each is scored against
// different parameters (MEDDIC-style methodology vs support QA vs CS
// health). This classifier is deterministic and keyless, and — same ethos
// as the gates — it shows its work: every verdict carries the transcript
// lines that drove it. The LLM's own callType field stays as a secondary
// opinion; pack routing uses this.

import { TranscriptLine } from "@/lib/types";

export type CallKind = "sales" | "support" | "customer_success";

export type KindMarker = {
  lineId: string;
  /** The phrase that matched, for display. */
  phrase: string;
};

export type CallKindResult = {
  kind: CallKind;
  /** high = clear margin, medium = ahead, low = defaulted to sales. */
  confidence: "high" | "medium" | "low";
  scores: Record<CallKind, number>;
  /** Receipts: up to 5 matched lines for the winning kind. */
  markers: KindMarker[];
};

// Order matters within a kind only for display; scoring counts every match.
const KIND_PATTERNS: Record<CallKind, RegExp[]> = {
  support: [
    /\b(ticket|case number|case id|incident|outage|downtime)\b/i,
    /\b(bug|error (code|message)|stack trace|logs?|crash(ing|ed)?)\b/i,
    /\b(not working|stopped working|broken|isn'?t loading|keeps? failing|can'?t log ?in)\b/i,
    /\b(troubleshoot|reproduce|restart|reinstall|clear (the )?cache|screen ?share)\b/i,
    /\b(escalat(e|ed|ion)|priority (one|1|two|2)|sev(erity)? ?[12])\b/i,
    /\b(workaround|hotfix|patch|known issue|root cause)\b/i,
    /\b(refund|credit (your|the) account)\b/i,
  ],
  customer_success: [
    /\b(renewal|renew(ing)?|contract (end|expir\w+)|anniversary)\b/i,
    /\b(quarterly business review|qbr|ebr|business review|check[- ]?in call)\b/i,
    /\b(adoption|usage (data|report|numbers)|active users|utilization|log ?in rates?)\b/i,
    /\b(onboard(ing|ed)|roll[- ]?out|go[- ]?live|training session|enablement)\b/i,
    /\b(health score|success plan|success criteria|business outcomes?)\b/i,
    /\b(since you (went live|launched|started)|over the (last|past) (quarter|month))\b/i,
    /\b(nps|csat survey|reference call|case study|advocacy)\b/i,
    /\b(expansion|additional (seats|licenses)|upgrade your plan|add[- ]?on)\b/i,
  ],
  sales: [
    /\b(pricing|price point|quote|discount|cost per|per seat|per user)\b/i,
    /\b(demo|trial|proof of concept|poc|pilot)\b/i,
    /\b(proposal|contract (terms)?|procurement|legal review|security review)\b/i,
    /\b(competitor|compared? (to|with)|evaluat(e|ing|ion)|shortlist|alternative)\b/i,
    /\b(budget|decision maker|sign[- ]?off|approval process|stakeholders?)\b/i,
    /\b(looking for a (solution|tool|platform)|switch(ing)? from|current (vendor|provider))\b/i,
    /\b(next steps? (would|could) be|send (over|you) (a|the) (proposal|deck|pricing))\b/i,
  ],
};

export function detectCallKind(transcript: TranscriptLine[]): CallKindResult {
  const scores: Record<CallKind, number> = {
    sales: 0,
    support: 0,
    customer_success: 0,
  };
  const markersByKind: Record<CallKind, KindMarker[]> = {
    sales: [],
    support: [],
    customer_success: [],
  };

  for (const line of transcript) {
    for (const kind of Object.keys(KIND_PATTERNS) as CallKind[]) {
      for (const pattern of KIND_PATTERNS[kind]) {
        const match = line.text.match(pattern);
        if (match) {
          scores[kind] += 1;
          if (markersByKind[kind].length < 5) {
            markersByKind[kind].push({
              lineId: line.id,
              phrase: match[0],
            });
          }
        }
      }
    }
  }

  const ranked = (Object.keys(scores) as CallKind[]).sort(
    (a, b) => scores[b] - scores[a],
  );
  const top = ranked[0]!;
  const second = ranked[1]!;

  // No signal at all → the historical default (sales), flagged low.
  if (scores[top] === 0) {
    return { kind: "sales", confidence: "low", scores, markers: [] };
  }

  const confidence: CallKindResult["confidence"] =
    scores[top] >= 3 && scores[top] >= scores[second] * 2
      ? "high"
      : scores[top] > scores[second]
        ? "medium"
        : "low";

  // A dead tie is unclassifiable — fall back to sales, keep the receipts.
  const kind = scores[top] === scores[second] ? "sales" : top;
  return { kind, confidence, scores, markers: markersByKind[kind] };
}

export const KIND_LABEL: Record<CallKind, string> = {
  sales: "Sales",
  support: "Support",
  customer_success: "Customer Success",
};

/** Default scorecard pack per detected kind. */
export const KIND_DEFAULT_PACK: Record<CallKind, string> = {
  sales: "meddic",
  support: "support_excellence",
  customer_success: "customer_success",
};
