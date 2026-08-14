// Sample dataset — 20 companies across deal stages, seeded on demand and
// clearly marked. Nothing here cheats the system: every generated call runs
// through the SAME notes loop and evidence gates as a real upload. Claims
// are built as verbatim substrings of their transcript lines, so "verified"
// means verified; at-risk calls deliberately include one unbackable
// next-step claim so the demo also shows the gate demoting it.

import { DealNotes, TranscriptLine } from "@/lib/types";

/** Seeded runs carry this sampleSlug prefix — it is how "clear" finds them. */
export const SAMPLE_SLUG_PREFIX = "demo-";

export type SampleStage =
  | "advancing"
  | "steady"
  | "at_risk"
  | "support"
  | "customer_success";

export type SampleCompanySpec = {
  slug: string;
  company: string;
  buyer: string;
  rep: string;
  stage: SampleStage;
  /** Featured calls get longer transcripts; the rest stay compact. */
  featured: boolean;
  title: string;
  pain: string;
  price: string;
  competitor: string;
  /** Days ago the call "happened" — spreads the timeline. */
  daysAgo: number;
};

export const SAMPLE_COMPANIES: SampleCompanySpec[] = [
  // ── Sales · advancing (Positive) ──────────────────────────────────────────
  { slug: "aurora-dental", company: "Aurora Dental Collective", buyer: "Nisha", rep: "Maya", stage: "advancing", featured: true, title: "Discovery: after-hours coverage", pain: "we miss around thirty after-hours calls every week", price: "twenty six per seat monthly", competitor: "RingHawk", daysAgo: 1 },
  { slug: "beacon-property", company: "Beacon Property Group", buyer: "Tom", rep: "Arjun", stage: "advancing", featured: true, title: "Demo follow-up: leasing lines", pain: "leasing agents lose tenant calls between showings", price: "nineteen per user each month", competitor: "DialCore", daysAgo: 2 },
  { slug: "cobalt-logistics", company: "Cobalt Logistics", buyer: "Elena", rep: "Maya", stage: "advancing", featured: true, title: "Pricing: dispatch desk rollout", pain: "dispatch misses driver callbacks during the night shift", price: "thirty one per seat a month", competitor: "FleetVoice", daysAgo: 3 },
  { slug: "driftwood-hotels", company: "Driftwood Hotels", buyer: "Marco", rep: "Priya", stage: "advancing", featured: false, title: "Front-desk routing review", pain: "front desk drops booking calls at checkout rush", price: "twenty two per line monthly", competitor: "InnCall", daysAgo: 4 },
  { slug: "emberline-fitness", company: "Emberline Fitness", buyer: "Dana", rep: "Arjun", stage: "advancing", featured: false, title: "Trial wrap-up: member desk", pain: "membership desk misses trial signups after seven pm", price: "seventeen per seat monthly", competitor: "GymDial", daysAgo: 5 },
  { slug: "foxglove-pharmacy", company: "Foxglove Pharmacy Network", buyer: "Ravi", rep: "Maya", stage: "advancing", featured: false, title: "Refill-line consolidation", pain: "refill requests pile up on voicemail overnight", price: "twenty eight per branch monthly", competitor: "MediRing", daysAgo: 6 },
  // ── Sales · steady (Neutral) ──────────────────────────────────────────────
  { slug: "granite-insurance", company: "Granite Peak Insurance", buyer: "Sofia", rep: "Priya", stage: "steady", featured: true, title: "Claims-desk evaluation", pain: "claims intake calls queue for eleven minutes on Mondays", price: "twenty four per adjuster monthly", competitor: "ClaimLine", daysAgo: 2 },
  { slug: "harborview-legal", company: "Harborview Legal", buyer: "Daniel", rep: "Maya", stage: "steady", featured: true, title: "Intake-line scoping call", pain: "client intake calls go unanswered during depositions", price: "thirty three per attorney monthly", competitor: "LexDial", daysAgo: 4 },
  { slug: "ironwood-mfg", company: "Ironwood Manufacturing", buyer: "Greta", rep: "Arjun", stage: "steady", featured: false, title: "Plant-floor paging review", pain: "shift supervisors miss supplier calls on the floor", price: "twenty one per seat monthly", competitor: "PlantPhone", daysAgo: 6 },
  { slug: "juniper-learning", company: "Juniper Learning", buyer: "Omar", rep: "Priya", stage: "steady", featured: false, title: "Enrollment-season prep", pain: "enrollment calls spike past capacity every August", price: "eighteen per counselor monthly", competitor: "EduRing", daysAgo: 8 },
  { slug: "kestrel-travel", company: "Kestrel Travel", buyer: "Lucia", rep: "Maya", stage: "steady", featured: false, title: "Rebooking-desk discussion", pain: "rebooking calls overflow whenever a storm hits", price: "twenty five per agent monthly", competitor: "TripLine", daysAgo: 9 },
  // ── Sales · at risk ───────────────────────────────────────────────────────
  { slug: "lumen-solar", company: "Lumen Solar", buyer: "Pete", rep: "Arjun", stage: "at_risk", featured: true, title: "Stalled: installer dispatch", pain: "installer scheduling calls bounce between three offices", price: "twenty nine per seat monthly", competitor: "SunVoice", daysAgo: 7 },
  { slug: "maplewood-vet", company: "Maplewood Vet Clinics", buyer: "Hana", rep: "Maya", stage: "at_risk", featured: true, title: "Objections: emergency line", pain: "emergency line rings to a pager after six", price: "twenty three per clinic monthly", competitor: "PetCall", daysAgo: 9 },
  { slug: "northgate-auto", company: "Northgate Auto Group", buyer: "Vik", rep: "Priya", stage: "at_risk", featured: false, title: "Budget pushback: service desk", pain: "service desk misses warranty callbacks", price: "twenty per advisor monthly", competitor: "AutoRing", daysAgo: 10 },
  { slug: "opaline-beauty", company: "Opaline Beauty Brands", buyer: "Chloe", rep: "Arjun", stage: "at_risk", featured: false, title: "Gone quiet: store lines", pain: "store associates ignore the corporate line", price: "sixteen per store monthly", competitor: "GlowDial", daysAgo: 12 },
  // ── Support ───────────────────────────────────────────────────────────────
  { slug: "pinebrook-credit", company: "Pinebrook Credit Union", buyer: "Aldo", rep: "Sam", stage: "support", featured: true, title: "Support: call recordings export", pain: "the recordings export fails with a timeout error", price: "", competitor: "", daysAgo: 1 },
  { slug: "quartz-analytics", company: "Quartz Analytics", buyer: "Mei", rep: "Sam", stage: "support", featured: true, title: "Support: webhook delivery", pain: "webhook deliveries stopped after the weekend deploy", price: "", competitor: "", daysAgo: 3 },
  // ── Customer success ──────────────────────────────────────────────────────
  { slug: "riverbend-clinics", company: "Riverbend Clinics", buyer: "Grace", rep: "Ivy", stage: "customer_success", featured: true, title: "QBR: adoption and renewal", pain: "two locations still route calls the old way", price: "", competitor: "", daysAgo: 2 },
  { slug: "solstice-retail", company: "Solstice Retail Co", buyer: "Ben", rep: "Ivy", stage: "customer_success", featured: false, title: "Check-in: seasonal readiness", pain: "holiday season doubles their call volume", price: "", competitor: "", daysAgo: 5 },
  { slug: "thornbury-accounting", company: "Thornbury & Co Accounting", buyer: "Fatima", rep: "Ivy", stage: "customer_success", featured: false, title: "Renewal-window review", pain: "tax season buries the front desk in calls", price: "", competitor: "", daysAgo: 8 },
];

// ── Builders ────────────────────────────────────────────────────────────────

type Built = { transcript: TranscriptLine[]; notes: DealNotes };

function lines(texts: Array<[speaker: string, text: string]>): TranscriptLine[] {
  return texts.map(([speaker, text], i) => ({
    id: `L${i + 1}`,
    index: i,
    speaker,
    text,
    startMs: i * 22_000,
    endMs: i * 22_000 + 20_000,
  }));
}

/** Claim whose quote is a verbatim substring of the cited line — gate-safe. */
function claim(transcript: TranscriptLine[], lineId: string, quote: string, text: string) {
  const line = transcript.find((l) => l.id === lineId);
  if (!line || !line.text.includes(quote)) {
    throw new Error(`sample-data: quote not in ${lineId}: ${quote}`);
  }
  return { text, evidence: { lineId, quote } };
}

function email(transcript: TranscriptLine[], lineId: string, quote: string, subject: string, body: string) {
  return { ...claim(transcript, lineId, quote, body), subject, body };
}

function salesAdvancing(s: SampleCompanySpec): Built {
  const t = lines([
    [s.rep, `Thanks for making time again. Last call you said ${s.pain} — is that still the picture?`],
    [s.buyer, `It is. Honestly ${s.pain}, and the team feels it every single day.`],
    [s.rep, `Then here is where pricing lands for you: ${s.price}, routing and texting included.`],
    [s.buyer, `That works for our budget. If rollout goes like the demo, we want to move forward this quarter.`],
    [s.rep, `Great. I will bring the rollout plan on Thursday at ten and we can walk your ops lead through it.`],
    [s.buyer, `Thursday at ten works. Send the recap and loop in procurement.`],
    ...(s.featured
      ? ([
          [s.rep, `One more thing — anyone else who should weigh in before Thursday?`],
          [s.buyer, `Bring our operations lead. She signs off on tooling with me.`],
        ] as Array<[string, string]>)
      : []),
  ]);
  const notes: DealNotes = {
    title: s.title,
    summary: [
      claim(t, "L2", s.pain, `${s.company} confirmed the core pain: ${s.pain}.`),
      claim(t, "L3", s.price, `Pricing presented at ${s.price} with routing and texting included.`),
    ],
    objections: [],
    intent: [claim(t, "L4", "we want to move forward this quarter", "Buyer wants to move forward this quarter if rollout matches the demo.")],
    nextSteps: [claim(t, "L5", "rollout plan on Thursday at ten", "Rep brings the rollout plan Thursday at 10 with the ops lead present.")],
    pain: [claim(t, "L2", s.pain, `Daily operational pain: ${s.pain}.`)],
    pricing: [claim(t, "L3", s.price, `Quoted ${s.price}.`)],
    competitors: [],
    followUpEmail: email(t, "L5", "rollout plan on Thursday at ten", `Follow-up: ${s.title}`, `Hi ${s.buyer},\n\nRecapping where we landed: pricing at ${s.price}, and I'll bring the rollout plan Thursday at ten. Looping in procurement as you asked.\n\n— ${s.rep}`),
  };
  return { transcript: t, notes };
}

function salesSteady(s: SampleCompanySpec): Built {
  const t = lines([
    [s.rep, `You mentioned ${s.pain}. How is that trending?`],
    [s.buyer, `Still true — ${s.pain}. But I have two concerns before we go further.`],
    [s.buyer, `First, migration timing worries me with our busy season coming up.`],
    [s.buyer, `Second, the team just learned the current system and change fatigue is real here.`],
    [s.rep, `Both fair. Pricing for your size is ${s.price}, and migration runs in parallel so nothing switches until you say so.`],
    [s.buyer, `Okay. Send me the migration outline and I will review it with the team next week.`],
    ...(s.featured
      ? ([
          [s.rep, `Will do. Who owns the final call on this on your side?`],
          [s.buyer, `It ends up with our COO, but the team review comes first.`],
        ] as Array<[string, string]>)
      : []),
  ]);
  const notes: DealNotes = {
    title: s.title,
    summary: [
      claim(t, "L2", s.pain, `Pain confirmed: ${s.pain}.`),
      claim(t, "L5", s.price, `Pricing shared at ${s.price}; migration runs in parallel.`),
    ],
    objections: [
      claim(t, "L3", "migration timing worries me", "Concern: migration timing against the busy season."),
      claim(t, "L4", "change fatigue is real", "Concern: team change fatigue after the last system switch."),
    ],
    intent: [claim(t, "L6", "review it with the team next week", "Buyer will review the migration outline with the team next week.")],
    nextSteps: [claim(t, "L6", "Send me the migration outline", "Rep to send the migration outline for the team review.")],
    pain: [claim(t, "L2", s.pain, `Ongoing pain: ${s.pain}.`)],
    pricing: [],
    competitors: [],
    followUpEmail: email(t, "L6", "Send me the migration outline", `Follow-up: ${s.title}`, `Hi ${s.buyer},\n\nAs discussed: migration outline attached for the team review next week, pricing at ${s.price}. Both concerns from the call are addressed in it.\n\n— ${s.rep}`),
  };
  return { transcript: t, notes };
}

function salesAtRisk(s: SampleCompanySpec): Built {
  const t = lines([
    [s.rep, `Picking up from last time on ${s.pain}.`],
    [s.buyer, `To be straight with you, we are pretty happy with ${s.competitor} for now.`],
    [s.buyer, `And budget is frozen until the next fiscal year regardless.`],
    [s.rep, `Understood. If anything changes on either front, the door stays open.`],
    [s.buyer, `Sure. No promises on timing from our side.`],
    ...(s.featured
      ? ([
          [s.rep, `Would a short note on how we stack up as an alternative to ${s.competitor} be useful someday?`],
          [s.buyer, `Maybe. Switching is not something we have even looked at yet.`],
        ] as Array<[string, string]>)
      : []),
  ]);
  const notes: DealNotes = {
    title: s.title,
    summary: [
      claim(t, "L2", `happy with ${s.competitor}`, `Buyer states they are happy with ${s.competitor} for now.`),
      claim(t, "L3", "budget is frozen", "Budget is frozen until the next fiscal year."),
    ],
    objections: [
      claim(t, "L2", `happy with ${s.competitor}`, `Incumbent satisfaction: ${s.competitor} is working for them today.`),
      claim(t, "L3", "budget is frozen until the next fiscal year", "No budget available this fiscal year."),
    ],
    // Deliberately unbackable claims — the gate demotes them on seed, which
    // is exactly what an at-risk call with no real commitment looks like.
    intent: [{ text: "Buyer remains open to revisiting soon.", evidence: { lineId: "L5", quote: "we should revisit this again soon" } }],
    nextSteps: [{ text: "Buyer to circle back after internal review.", evidence: { lineId: "L5", quote: "circle back after our internal review" } }],
    pain: [claim(t, "L1", s.pain, `Original pain still unaddressed: ${s.pain}.`)],
    pricing: [],
    competitors: [claim(t, "L2", `happy with ${s.competitor} for now`, `${s.competitor} is the incumbent.`)],
    followUpEmail: email(t, "L4", "the door stays open", `Follow-up: ${s.title}`, `Hi ${s.buyer},\n\nThanks for the honesty on ${s.competitor} and budget timing. The door stays open — I'll check in ahead of your next fiscal year.\n\n— ${s.rep}`),
  };
  return { transcript: t, notes };
}

function supportCall(s: SampleCompanySpec): Built {
  const t = lines([
    [s.buyer, `We opened ticket 4471 this morning — ${s.pain}.`],
    [s.rep, `So to confirm: ${s.pain}, starting after yesterday. Did I get that right?`],
    [s.buyer, `Exactly right. We just need this working before Friday payroll.`],
    [s.rep, `Let's troubleshoot together — can you reproduce the error while I watch the logs?`],
    [s.buyer, `Running it now. Same failure.`],
    [s.rep, `Okay, I can see the root cause. I will escalate this as a priority two and you will have an update from me by ten tomorrow under ticket 4471.`],
    ...(s.featured
      ? ([
          [s.buyer, `Appreciate the clear timeline. That is all we needed today.`],
          [s.rep, `Recapping: issue confirmed, escalated priority two, update by ten tomorrow. Anything else while I have you?`],
        ] as Array<[string, string]>)
      : []),
  ]);
  const notes: DealNotes = {
    title: s.title,
    summary: [
      claim(t, "L2", s.pain, `Issue verified with the customer: ${s.pain}.`),
      claim(t, "L6", "escalate this as a priority two", "Escalated as priority two with a committed update time."),
    ],
    objections: [],
    intent: [claim(t, "L3", "working before Friday payroll", "Customer needs this resolved before Friday payroll.")],
    nextSteps: [claim(t, "L6", "update from me by ten tomorrow under ticket 4471", "Agent to update by 10am tomorrow under ticket 4471.")],
    pain: [claim(t, "L1", s.pain, `Reported issue: ${s.pain}.`)],
    pricing: [],
    competitors: [],
    followUpEmail: email(t, "L6", "update from me by ten tomorrow", `Follow-up: ${s.title}`, `Hi ${s.buyer},\n\nConfirming today's call: issue verified, escalated priority two, and you'll have an update from me by ten tomorrow under ticket 4471.\n\n— ${s.rep}`),
  };
  return { transcript: t, notes };
}

function csCall(s: SampleCompanySpec): Built {
  const t = lines([
    [s.rep, `Ahead of your renewal I pulled the usage data for this quarterly business review.`],
    [s.buyer, `Good timing — adoption has been on my mind since ${s.pain}.`],
    [s.rep, `Overall usage is up, and the success plan says the next milestone is fixing exactly that.`],
    [s.buyer, `Agreed. If we solve it before renewal, this becomes an easy yes internally.`],
    [s.rep, `Then let's lock it: I send the adoption report Friday and we review results on the twenty second.`],
    ...(s.featured
      ? ([
          [s.buyer, `Booked. And bring an expansion option for the new location while you are at it.`],
          [s.rep, `Will do — expansion option for the new location goes in the same review.`],
        ] as Array<[string, string]>)
      : []),
  ]);
  const notes: DealNotes = {
    title: s.title,
    summary: [
      claim(t, "L2", s.pain, `Adoption gap on the table: ${s.pain}.`),
      claim(t, "L3", "usage is up, and the success plan says the next milestone", "Overall usage trending up; success plan targets the gap."),
    ],
    objections: [],
    intent: [claim(t, "L4", "this becomes an easy yes internally", "Renewal becomes an easy yes if the adoption gap closes first.")],
    nextSteps: [claim(t, "L5", "adoption report Friday", "CSM sends the adoption report Friday; results review on the 22nd.")],
    pain: [claim(t, "L2", s.pain, `Adoption gap: ${s.pain}.`)],
    pricing: [],
    competitors: [],
    followUpEmail: email(t, "L5", "adoption report Friday", `Follow-up: ${s.title}`, `Hi ${s.buyer},\n\nLocked from our review: adoption report lands Friday, results review on the 22nd, renewal path clear once the gap closes.\n\n— ${s.rep}`),
  };
  return { transcript: t, notes };
}

const BUILDERS: Record<SampleStage, (s: SampleCompanySpec) => Built> = {
  advancing: salesAdvancing,
  steady: salesSteady,
  at_risk: salesAtRisk,
  support: supportCall,
  customer_success: csCall,
};

export function buildSampleCall(spec: SampleCompanySpec): Built {
  return BUILDERS[spec.stage](spec);
}

export function sampleSlugFor(spec: SampleCompanySpec): string {
  return `${SAMPLE_SLUG_PREFIX}${spec.slug}`;
}
