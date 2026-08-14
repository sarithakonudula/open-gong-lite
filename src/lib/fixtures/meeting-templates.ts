// Fixture meeting-notes templates — the notes-structure library from the
// design. Sample data: the pipeline's real note structure is fixed (summary /
// objections / intent / next steps, each claim citation-gated); these show
// where per-meeting-type structures will plug in.

export type MeetingTemplateFixture = {
  id: string;
  category: string;
  title: string;
  prompt: string;
};

export const MEETING_TEMPLATE_CATEGORIES = ["Customer Success"] as const;

export const MEETING_TEMPLATE_FIXTURES: MeetingTemplateFixture[] = [
  {
    id: "cs-onboarding",
    category: "Customer Success",
    title: "Customer onboarding meetings",
    prompt:
      "You are summarizing a customer onboarding meeting.\n\nYour goal is to help internal teams understand the customer's context, onboarding scope, and next steps.\n\nAnalyze the conversation and extract:\n\n• Customer background and context: relevant history, goals, or constraints\n• Product overview: high-level introduction or framing provided\n• Relevant features: capabilities most applicable to the customer's needs\n• Next steps and action items: onboarding tasks, owners, and timelines\n\nEvery extracted line must carry a citation to the transcript moment it came from — notes the checker cannot back stay marked and never ship.",
  },
  {
    id: "cs-checkin",
    category: "Customer Success",
    title: "Customer check-in meetings",
    prompt:
      "You are summarizing a recurring customer check-in.\n\nExtract: current usage and adoption signals, open issues and their owners, risks raised in the customer's own words, and agreed next steps with dates.\n\nEvery line carries a citation to the call; unbacked notes stay marked on the page.",
  },
  {
    id: "cs-feedback",
    category: "Customer Success",
    title: "Feedback call",
    prompt:
      "You are summarizing a customer feedback call.\n\nExtract: what prompted the feedback, specific product moments quoted verbatim, severity in the customer's words, and commitments made by either side.\n\nQuotes must match the transcript exactly — the citation gate rejects paraphrase presented as quote.",
  },
  {
    id: "cs-call-scoring",
    category: "Customer Success",
    title: "Onboarding call scoring",
    prompt:
      "Score this onboarding call with the customer_success methodology pack: agenda control, activation steps, risk surfacing, and next-step clarity, each 0-3 with a cited moment as evidence.\n\nTraits without a citable moment score as missing — never inferred.",
  },
  {
    id: "cs-business-review",
    category: "Customer Success",
    title: "Business review",
    prompt:
      "You are summarizing a periodic business review.\n\nExtract: outcomes vs. goals stated on the call, stakeholder sentiment in their own quoted words, renewal or expansion signals, risks, and the agreed plan.\n\nEvery line must carry a citation; the follow-up email is built only from backed lines.",
  },
];
