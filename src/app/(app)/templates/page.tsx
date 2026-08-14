import closePilot from "../../../../templates/close-pilot-confirmation.json";
import commitment from "../../../../templates/commitment-fulfillment.json";
import ghosted from "../../../../templates/ghosted-deal-nudge.json";
import noNextStep from "../../../../templates/no-next-step-reengagement.json";
import objectionAddressed from "../../../../templates/objection-addressed.json";
import postDemo from "../../../../templates/post-demo-followup.json";
import postDiscovery from "../../../../templates/post-discovery-followup.json";
import pricing from "../../../../templates/pricing-followup.json";

import { TemplatesClient } from "@/components/templates/TemplatesClient";
import type {
  FollowUpTemplateView,
  TemplateBlockView,
  TemplateRuleView,
} from "@/components/templates/template-view-types";
import { MEETING_TEMPLATE_FIXTURES } from "@/lib/fixtures/meeting-templates";

export const metadata = { title: "Templates — OpenGong Lite" };

const RAW_TEMPLATES = [
  closePilot,
  commitment,
  ghosted,
  noNextStep,
  objectionAddressed,
  postDemo,
  postDiscovery,
  pricing,
] as unknown[];

type RawClause = {
  section?: string;
  scope?: string;
  metric?: string;
  min?: number;
  exists?: boolean;
  where?: Record<string, unknown>;
};

const SECTION_LABEL: Record<string, string> = {
  pain: "a verified pain note",
  next_steps: "an agreed next step",
  summary: "a verified summary note",
  objections: "an objection",
  pricing: "a pricing note",
  buying_stage: "the buying stage",
};

const METRIC_LABEL: Record<string, (min: number) => string> = {
  open_rep_promises: (min) =>
    `the rep owes ${min}+ open promise${min === 1 ? "" : "s"} on this deal`,
  days_since_last_call: (min) => `${min}+ days since the last call`,
};

function humanizeClause(clause: RawClause): string {
  if (clause.metric) {
    const fn = METRIC_LABEL[clause.metric];
    return fn ? fn(clause.min ?? 1) : `${clause.metric} ≥ ${clause.min ?? 1}`;
  }
  const base = SECTION_LABEL[clause.section ?? ""] ?? clause.section ?? "a note";
  if (clause.exists === false) return `no ${base} at all`;
  if (clause.where) {
    const parts = Object.entries(clause.where).map(([key, value]) => {
      const values = Array.isArray(value) ? value.join(" / ") : String(value);
      return `${key.replace(/_/g, " ")}: ${values.replace(/_/g, " ")}`;
    });
    return `${base} (${parts.join("; ")})`;
  }
  return base;
}

function toView(raw: unknown): FollowUpTemplateView {
  const t = raw as {
    id: string;
    title: string;
    short: string;
    priority: number;
    situation: string;
    panel: { explainer: string };
    subject: string;
    word_limit: number;
    routing: { trigger: Record<string, RawClause[]> };
    blocks: Array<Record<string, unknown>>;
  };

  const rules: TemplateRuleView[] = [];
  for (const [key, mode] of [
    ["all_of", "all of"],
    ["any_of", "any of"],
    ["none_of", "none of"],
  ] as const) {
    const clauses = t.routing.trigger[key];
    if (clauses?.length) {
      rules.push({ mode, clauses: clauses.map(humanizeClause) });
    }
  }

  const blocks: TemplateBlockView[] = t.blocks.map((block) => {
    if (block.type === "slot") {
      return {
        type: "slot",
        label: String(block.label ?? "Slot"),
        section: String(block.section ?? ""),
        ...(block.limit != null ? { limit: Number(block.limit) } : {}),
        ...(block.hint ? { hint: String(block.hint) } : {}),
      };
    }
    if (block.type === "instruction") {
      return { type: "instruction", text: String(block.text ?? "") };
    }
    return { type: "text", text: String(block.text ?? "") };
  });

  return {
    id: t.id,
    title: t.title,
    short: t.short,
    priority: t.priority,
    situation: t.situation,
    explainer: t.panel.explainer,
    subject: t.subject,
    wordLimit: t.word_limit,
    rules,
    blocks,
  };
}

export default function TemplatesPage() {
  const followUps = RAW_TEMPLATES.map(toView).sort(
    (a, b) => b.priority - a.priority,
  );
  return (
    <TemplatesClient
      followUps={followUps}
      meetingFixtures={MEETING_TEMPLATE_FIXTURES}
    />
  );
}
