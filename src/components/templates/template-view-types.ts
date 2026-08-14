// Plain serializable shapes handed from the server page to the client —
// the client never imports the routing engine or the raw JSON.

export type TemplateBlockView =
  | { type: "text"; text: string }
  | { type: "slot"; label: string; section: string; limit?: number; hint?: string }
  | { type: "instruction"; text: string };

export type TemplateRuleView = {
  mode: "all of" | "any of" | "none of";
  clauses: string[];
};

export type FollowUpTemplateView = {
  id: string;
  title: string;
  short: string;
  priority: number;
  situation: string;
  explainer: string;
  subject: string;
  wordLimit: number;
  rules: TemplateRuleView[];
  blocks: TemplateBlockView[];
};
