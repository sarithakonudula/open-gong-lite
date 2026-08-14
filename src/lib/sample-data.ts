// Sample dataset — 24 companies, 42 calls (17 sales / 14 customer success /
// 11 customer-support), seeded on demand and clearly marked. Nothing here
// cheats the system: every generated call runs through the SAME notes loop
// and evidence gates as a real upload. Claims are built as verbatim
// substrings of their transcript lines, so "verified" means verified;
// at-risk calls deliberately include one unbackable next-step claim so the
// demo also shows the gate demoting it.

import { evaluateDealSignals, type DealSignal, type DealSignalFeed } from "@/lib/deal-signals";
import {
  applyMethodologyVerdict,
  getMethodologyPack,
  type MethodologyVerdict,
} from "@/lib/methodology";
import { DealNotes, TranscriptLine } from "@/lib/types";
import { SAMPLE_DATASET } from "@/lib/sample-dataset-meta";

export { SAMPLE_DATASET };

/** Frozen "now" so deal-signal recency rules fire the same way every seed. */
export const SAMPLE_SIGNALS_NOW = "2026-08-14T16:00:00Z";

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

export type SampleCallSpec = SampleCompanySpec;

export const SAMPLE_CALLS: SampleCallSpec[] = [
  { slug: "pickle-rick-discovery", company: "Pickle Rick Robotics", buyer: "Blorbo", rep: "Chip McCloser", stage: "advancing", featured: true, title: "Discovery: night-shift dispatch bots", pain: "we miss around thirty after-hours calls every week", price: "twenty six per seat monthly", competitor: "RingHawk", daysAgo: 8 },
  { slug: "pickle-rick-demo", company: "Pickle Rick Robotics", buyer: "Blorbo", rep: "Chip McCloser", stage: "advancing", featured: true, title: "Demo: pickle-powered routing", pain: "we miss around thirty after-hours calls every week", price: "twenty six per seat monthly", competitor: "RingHawk", daysAgo: 2 },
  { slug: "nacho-average-pricing", company: "Nacho Average CRM", buyer: "Cheddar", rep: "Tessa Talksalot", stage: "advancing", featured: true, title: "Pricing: queso-tier rollout", pain: "sales reps lose inbound nacho-hot leads between standups", price: "nineteen per user each month", competitor: "DialCore", daysAgo: 3 },
  { slug: "buttercup-bagel-trial", company: "Buttercup Bagel Labs", buyer: "Poppy", rep: "Penny Pitch", stage: "advancing", featured: false, title: "Trial wrap-up: oven-line coverage", pain: "the bakery desk misses wholesale orders after four am", price: "seventeen per seat monthly", competitor: "GymDial", daysAgo: 4 },
  { slug: "yeet-yacht-routing", company: "Yeet Yacht Rentals", buyer: "Captain Splash", rep: "Duke Pipeline", stage: "advancing", featured: false, title: "Front-desk routing for the marina", pain: "front desk drops booking calls at checkout rush", price: "twenty two per line monthly", competitor: "InnCall", daysAgo: 5 },
  { slug: "spork-spoon-claims", company: "Spork and Spoon Logistics", buyer: "Marge Incharge", rep: "Moira Softsell", stage: "steady", featured: true, title: "Claims-desk evaluation", pain: "claims intake calls queue for eleven minutes on Mondays", price: "twenty four per adjuster monthly", competitor: "ClaimLine", daysAgo: 2 },
  { slug: "llama-drama-intake", company: "Llama Drama Studios", buyer: "Drama Llama", rep: "Chip McCloser", stage: "steady", featured: false, title: "Intake-line scoping call", pain: "client intake calls go unanswered during depositions", price: "thirty three per attorney monthly", competitor: "LexDial", daysAgo: 6 },
  { slug: "waffle-iron-enrollment", company: "Waffle Iron Ventures", buyer: "Syrup", rep: "Penny Pitch", stage: "steady", featured: false, title: "Enrollment-season prep", pain: "enrollment calls spike past capacity every August", price: "eighteen per counselor monthly", competitor: "EduRing", daysAgo: 8 },
  { slug: "soggy-bottom-stalled", company: "Soggy Bottom Freight", buyer: "Foghorn", rep: "Gordy Ghosted", stage: "at_risk", featured: true, title: "Stalled: installer dispatch", pain: "installer scheduling calls bounce between three offices", price: "twenty nine per seat monthly", competitor: "SunVoice", daysAgo: 9 },
  { slug: "banjo-banana-objections", company: "Banjo Banana Co", buyer: "Peel", rep: "Gordy Ghosted", stage: "at_risk", featured: false, title: "Objections: emergency line", pain: "emergency line rings to a pager after six", price: "twenty three per clinic monthly", competitor: "PetCall", daysAgo: 10 },
  { slug: "cactus-cowboy-budget", company: "Cactus Cowboy Cloud", buyer: "Dusty", rep: "Duke Pipeline", stage: "at_risk", featured: false, title: "Budget pushback: service desk", pain: "service desk misses warranty callbacks", price: "twenty per advisor monthly", competitor: "AutoRing", daysAgo: 12 },
  { slug: "moist-towelette-discovery", company: "Moist Towelette Inc", buyer: "Damp", rep: "Tessa Talksalot", stage: "advancing", featured: true, title: "Discovery: store-line coverage", pain: "store associates ignore the corporate line after lunch", price: "sixteen per store monthly", competitor: "GlowDial", daysAgo: 11 },
  { slug: "moist-towelette-qbr", company: "Moist Towelette Inc", buyer: "Damp", rep: "Ivy Renewsalot", stage: "customer_success", featured: true, title: "QBR: wipe-dispenser adoption", pain: "two locations still route calls the old way", price: "", competitor: "", daysAgo: 3 },
  { slug: "feral-spreadsheet-scope", company: "Feral Spreadsheet LLC", buyer: "Pivot", rep: "Moira Softsell", stage: "steady", featured: false, title: "Plant-floor paging review", pain: "shift supervisors miss supplier calls on the floor", price: "twenty one per seat monthly", competitor: "PlantPhone", daysAgo: 7 },
  { slug: "feral-spreadsheet-checkin", company: "Feral Spreadsheet LLC", buyer: "Pivot", rep: "Calvin Churnbuster", stage: "customer_success", featured: false, title: "Check-in: spreadsheet rebellion", pain: "holiday season doubles their call volume", price: "", competitor: "", daysAgo: 2 },
  { slug: "otter-space-stalled", company: "Otter Space Wellness", buyer: "Splash", rep: "Gordy Ghosted", stage: "at_risk", featured: true, title: "Gone quiet: clinic lines", pain: "the wellness desk parks overflow on a fuzzy otter voicemail", price: "twenty seven per clinic monthly", competitor: "ZenDial", daysAgo: 14 },
  { slug: "otter-space-renewal", company: "Otter Space Wellness", buyer: "Splash", rep: "Ivy Renewsalot", stage: "customer_success", featured: true, title: "Renewal-window review", pain: "two pods still skip the wellness check-in flow", price: "", competitor: "", daysAgo: 4 },
  { slug: "biscuit-brigade-demo", company: "Biscuit Brigade Banking", buyer: "Gravy", rep: "Chip McCloser", stage: "advancing", featured: false, title: "Demo follow-up: teller lines", pain: "teller lines lose inbound biscuit-hot leads between standups", price: "thirty one per seat a month", competitor: "FleetVoice", daysAgo: 1 },
  { slug: "biscuit-brigade-qbr", company: "Biscuit Brigade Banking", buyer: "Gravy", rep: "Calvin Churnbuster", stage: "customer_success", featured: false, title: "QBR: gravy-train adoption", pain: "two branches still route calls the old way", price: "", competitor: "", daysAgo: 6 },
  { slug: "pigeon-express-pricing", company: "Pigeon Express Legal", buyer: "Coo", rep: "Penny Pitch", stage: "advancing", featured: false, title: "Pricing: carrier-desk rollout", pain: "dispatch misses driver callbacks during the night shift", price: "twenty eight per branch monthly", competitor: "MediRing", daysAgo: 3 },
  { slug: "pigeon-express-checkin", company: "Pigeon Express Legal", buyer: "Coo", rep: "Ivy Renewsalot", stage: "customer_success", featured: false, title: "Check-in: roost readiness", pain: "tax season buries the front desk in calls", price: "", competitor: "", daysAgo: 5 },
  { slug: "marmalade-moon-eval", company: "Marmalade Moon Hotels", buyer: "Zest", rep: "Duke Pipeline", stage: "steady", featured: true, title: "Rebooking-desk discussion", pain: "rebooking calls overflow whenever a storm hits", price: "twenty five per agent monthly", competitor: "TripLine", daysAgo: 4 },
  { slug: "marmalade-moon-qbr", company: "Marmalade Moon Hotels", buyer: "Zest", rep: "Calvin Churnbuster", stage: "customer_success", featured: true, title: "QBR: seasonal marmalade rush", pain: "holiday season doubles their call volume", price: "", competitor: "", daysAgo: 1 },
  { slug: "gigglepixel-qbr", company: "Gigglepixel Games", buyer: "Loot", rep: "Ivy Renewsalot", stage: "customer_success", featured: true, title: "QBR: guild adoption", pain: "two studios still route raid calls the old way", price: "", competitor: "", daysAgo: 2 },
  { slug: "gigglepixel-enablement", company: "Gigglepixel Games", buyer: "Loot", rep: "Ivy Renewsalot", stage: "customer_success", featured: false, title: "Enablement: new realm go-live", pain: "onboarding still skips the weekly usage report", price: "", competitor: "", daysAgo: 9 },
  { slug: "gigglepixel-expansion", company: "Gigglepixel Games", buyer: "Loot", rep: "Calvin Churnbuster", stage: "customer_success", featured: false, title: "Expansion: extra seats for season pass", pain: "login rates dipped over the last quarter", price: "", competitor: "", daysAgo: 16 },
  { slug: "tofu-titan-qbr", company: "Tofu Titan Fitness", buyer: "Seitan", rep: "Calvin Churnbuster", stage: "customer_success", featured: true, title: "QBR: protein-desk health", pain: "two gyms still route member calls the old way", price: "", competitor: "", daysAgo: 3 },
  { slug: "tofu-titan-checkin", company: "Tofu Titan Fitness", buyer: "Seitan", rep: "Ivy Renewsalot", stage: "customer_success", featured: false, title: "Check-in: smoothie-bar readiness", pain: "holiday season doubles their call volume", price: "", competitor: "", daysAgo: 8 },
  { slug: "tofu-titan-renewal", company: "Tofu Titan Fitness", buyer: "Seitan", rep: "Calvin Churnbuster", stage: "customer_success", featured: false, title: "Renewal-window review", pain: "tax season buries the front desk in calls", price: "", competitor: "", daysAgo: 13 },
  { slug: "quokka-coffee-qbr", company: "Quokka Coffee Roasters", buyer: "Bean", rep: "Ivy Renewsalot", stage: "customer_success", featured: false, title: "QBR: cafe-line adoption", pain: "two cafes still route calls the old way", price: "", competitor: "", daysAgo: 4 },
  { slug: "quokka-coffee-checkin", company: "Quokka Coffee Roasters", buyer: "Bean", rep: "Calvin Churnbuster", stage: "customer_success", featured: false, title: "Check-in: roast-season volume", pain: "holiday season doubles their call volume", price: "", competitor: "", daysAgo: 11 },
  { slug: "sloth-speed-export", company: "Sloth Speed Internet", buyer: "Yawn", rep: "Sam Ticketwrangler", stage: "support", featured: true, title: "Support: call recordings export", pain: "the recordings export fails with a timeout error", price: "", competitor: "", daysAgo: 1 },
  { slug: "sloth-speed-login", company: "Sloth Speed Internet", buyer: "Yawn", rep: "Paige Panic", stage: "support", featured: false, title: "Support: can't log in after deploy", pain: "the admin console isn't loading since the weekend deploy", price: "", competitor: "", daysAgo: 4 },
  { slug: "sloth-speed-outage", company: "Sloth Speed Internet", buyer: "Yawn", rep: "Sam Ticketwrangler", stage: "support", featured: false, title: "Support: overnight outage ticket", pain: "the overnight routing rule keeps crashing with an error code", price: "", competitor: "", daysAgo: 8 },
  { slug: "duck-duck-webhook", company: "Duck Duck Goose HR", buyer: "Honk", rep: "Paige Panic", stage: "support", featured: true, title: "Support: webhook delivery", pain: "webhook deliveries stopped after the weekend deploy", price: "", competitor: "", daysAgo: 2 },
  { slug: "duck-duck-cache", company: "Duck Duck Goose HR", buyer: "Honk", rep: "Sam Ticketwrangler", stage: "support", featured: false, title: "Support: cache-clear loop", pain: "the dashboard keeps failing until we clear the cache", price: "", competitor: "", daysAgo: 6 },
  { slug: "pretzel-logic-timeout", company: "Pretzel Logic Pharma", buyer: "Twist", rep: "Sam Ticketwrangler", stage: "support", featured: true, title: "Support: refill export timeout", pain: "the recordings export fails with a timeout error", price: "", competitor: "", daysAgo: 3 },
  { slug: "pretzel-logic-bug", company: "Pretzel Logic Pharma", buyer: "Twist", rep: "Paige Panic", stage: "support", featured: false, title: "Support: known issue on labels", pain: "the label printer bug keeps failing with error code 500", price: "", competitor: "", daysAgo: 7 },
  { slug: "noodle-incident-crash", company: "Noodle Incident Retail", buyer: "Ramen", rep: "Paige Panic", stage: "support", featured: false, title: "Support: register crash", pain: "the register app crashed twice during lunch rush", price: "", competitor: "", daysAgo: 1 },
  { slug: "noodle-incident-hotfix", company: "Noodle Incident Retail", buyer: "Ramen", rep: "Sam Ticketwrangler", stage: "support", featured: false, title: "Support: hotfix follow-up", pain: "the workaround broke after last night's patch", price: "", competitor: "", daysAgo: 5 },
  { slug: "crumb-trail-ticket", company: "Crumb Trail Accounting", buyer: "Scone", rep: "Sam Ticketwrangler", stage: "support", featured: true, title: "Support: ledger export ticket", pain: "the ledger export fails with a timeout error", price: "", competitor: "", daysAgo: 2 },
  { slug: "crumb-trail-rootcause", company: "Crumb Trail Accounting", buyer: "Scone", rep: "Paige Panic", stage: "support", featured: false, title: "Support: root-cause recap", pain: "the tax-form upload isn't loading for two offices", price: "", competitor: "", daysAgo: 9 },
];

export const SAMPLE_COMPANIES: SampleCallSpec[] = SAMPLE_CALLS;

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
    [s.rep, `Thanks for making time again. Last call you said ${s.pain} — is that still the picture? I'll send a recap after we talk.`],
    [s.buyer, `It is. Honestly ${s.pain}, and the team feels it every single day.`],
    [s.rep, `Then here is where pricing lands for you: ${s.price}, routing and texting included. Let me walk you through the proposal.`],
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
    [s.rep, `You mentioned ${s.pain}. How is that trending? I'll send notes after.`],
    [s.buyer, `Still true — ${s.pain}. But I have two concerns before we go further.`],
    [s.buyer, `First, migration timing worries me with our busy season coming up.`],
    [s.buyer, `Second, the team just learned the current system and change fatigue is real here.`],
    [s.rep, `Both fair. Pricing for your size is ${s.price}, and migration runs in parallel so nothing switches until you say so. I'll send the migration outline today.`],
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
    [s.rep, `Picking up from last time on ${s.pain}. I'll send a note if anything changes.`],
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
    [s.rep, `Okay, I can see the root cause. I will escalate this as a priority two and you will have an update from me by ten tomorrow under ticket 4471. Let me pull the logs into the ticket.`],
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
    [s.rep, `Overall usage is up, and the success plan says the next milestone is fixing exactly that. I'll send the numbers after.`],
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

export function isSampleSlug(slug: string | undefined): boolean {
  return Boolean(slug?.startsWith(SAMPLE_SLUG_PREFIX));
}

export function specForSampleSlug(slug: string | undefined): SampleCallSpec | null {
  if (!slug?.startsWith(SAMPLE_SLUG_PREFIX)) return null;
  const rest = slug.slice(SAMPLE_SLUG_PREFIX.length);
  return SAMPLE_CALLS.find((s) => s.slug === rest) ?? null;
}

export function dealValueFor(spec: SampleCallSpec): number {
  if (spec.stage === "advancing") return 32_000;
  if (spec.stage === "steady") return 18_000;
  if (spec.stage === "at_risk") return 24_000;
  if (spec.stage === "support") return 6_000;
  return 40_000;
}

export function packIdFor(spec: SampleCallSpec): string {
  if (spec.stage === "support") return "support_excellence";
  if (spec.stage === "customer_success") return "customer_success";
  return "meddic";
}

function ev(transcript: TranscriptLine[], lineId: string, quote: string) {
  const line = transcript.find((l) => l.id === lineId);
  if (!line || !line.text.includes(quote)) {
    throw new Error(`sample-data methodology: quote not in ${lineId}: ${quote}`);
  }
  return { lineId, quote };
}

export function sampleMethodologyVerdict(
  spec: SampleCallSpec,
  transcript: TranscriptLine[],
): MethodologyVerdict {
  const featured = spec.featured;
  if (spec.stage === "support") {
    return {
      callType: "support",
      overallNote: `${spec.rep} confirmed ticket 4471, reproduced the failure, and committed a priority-two update.`,
      contextFlags: ["short_call"],
      traits: [
        { id: "issue_discovery", depth: "mastery", confidence: 0.9, evidence: [ev(transcript, "L1", spec.pain)], gap: "" },
        { id: "empathy_acknowledgment", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L2", "Did I get that right")], gap: "Acknowledgment was a recap, not an explicit empathy line." },
        { id: "ownership", depth: "mastery", confidence: 0.9, evidence: [ev(transcript, "L6", "escalate this as a priority two")], gap: "" },
        { id: "troubleshooting_rigor", depth: "developing", confidence: 0.85, evidence: [ev(transcript, "L4", "troubleshoot together")], gap: "Repro happened, but the logs were not narrated step by step." },
        { id: "expectation_setting", depth: "mastery", confidence: 0.9, evidence: [ev(transcript, "L6", "update from me by ten tomorrow under ticket 4471")], gap: "" },
        { id: "resolution_confirmation", depth: featured ? "developing" : "surface", confidence: 0.7, evidence: featured ? [ev(transcript, "L8", "issue confirmed, escalated priority two")] : [ev(transcript, "L6", "escalate this as a priority two")], gap: featured ? "" : "No wrap-up recap on this shorter call." },
        { id: "escalation_hygiene", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L6", "escalate this as a priority two")], gap: "Severity was named; the escalation path beyond the agent was not." },
        { id: "wrapup_prevention", depth: featured ? "developing" : "missing", confidence: 0.6, evidence: featured ? [ev(transcript, "L8", "Anything else while I have you")] : [], gap: featured ? "" : "No prevention question on this call." },
      ],
    };
  }
  if (spec.stage === "customer_success") {
    return {
      callType: "qbr",
      overallNote: `${spec.rep} used usage data to frame the renewal around the adoption gap.`,
      contextFlags: featured ? [] : ["short_call"],
      traits: [
        { id: "outcome_alignment", depth: "developing", confidence: 0.85, evidence: [ev(transcript, "L4", "this becomes an easy yes internally")], gap: "Renewal yes is conditional; business outcome metrics were not restated in dollars." },
        { id: "adoption_review", depth: "mastery", confidence: 0.9, evidence: [ev(transcript, "L2", spec.pain)], gap: "" },
        { id: "value_articulation", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L3", "usage is up, and the success plan says the next milestone")], gap: "Usage is up, but value was not translated into a saved-hour or revenue number." },
        { id: "stakeholder_health", depth: featured ? "developing" : "missing", confidence: 0.7, evidence: featured ? [ev(transcript, "L6", "expansion option for the new location")] : [], gap: featured ? "New location surfaced; other stakeholders were not mapped." : "No multi-thread on this check-in." },
        { id: "risk_sensing", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L2", "adoption has been on my mind")], gap: "The gap is named; no health-score or churn trigger was quantified." },
        { id: "renewal_management", depth: "mastery", confidence: 0.9, evidence: [ev(transcript, "L1", "Ahead of your renewal I pulled the usage data")], gap: "" },
        { id: "expansion_discovery", depth: featured ? "developing" : "missing", confidence: 0.75, evidence: featured ? [ev(transcript, "L7", "expansion option for the new location")] : [], gap: featured ? "" : "No expansion ask on this call." },
        { id: "success_planning", depth: "developing", confidence: 0.85, evidence: [ev(transcript, "L5", "adoption report Friday")], gap: "Next milestone is dated; success criteria beyond the report were not written down." },
      ],
    };
  }
  if (spec.stage === "at_risk") {
    return {
      callType: "discovery",
      overallNote: `Buyer is happy with ${spec.competitor} and budget is frozen — the call produced honesty, not a next step.`,
      contextFlags: ["single_threaded"],
      traits: [
        { id: "identify_pain", depth: "surface", confidence: 0.7, evidence: [ev(transcript, "L1", spec.pain)], gap: "Pain was restated by the rep; the buyer never re-owned it on this call." },
        { id: "metrics", depth: "missing", confidence: 0.8, evidence: [], gap: "No quantified impact was discussed." },
        { id: "economic_buyer", depth: "missing", confidence: 0.75, evidence: [], gap: "Budget freeze was announced; nobody asked who owns the thaw." },
        { id: "decision_criteria", depth: "surface", confidence: 0.65, evidence: [ev(transcript, "L2", `happy with ${spec.competitor}`)], gap: "Incumbent satisfaction is a criterion by implication only." },
        { id: "decision_process", depth: "missing", confidence: 0.8, evidence: [], gap: "No path, date, or approver after fiscal thaw." },
        { id: "champion", depth: "missing", confidence: 0.85, evidence: [], gap: "Single-threaded and going quiet." },
      ],
    };
  }
  if (spec.stage === "steady") {
    return {
      callType: "evaluation",
      overallNote: `${spec.rep} priced the deal and collected two real objections; the next step is a team review, not a close.`,
      contextFlags: ["single_threaded"],
      traits: [
        { id: "identify_pain", depth: "developing", confidence: 0.85, evidence: [ev(transcript, "L2", spec.pain)], gap: "Pain is confirmed but not tied to a dollar impact." },
        { id: "metrics", depth: "surface", confidence: 0.7, evidence: [ev(transcript, "L5", spec.price)], gap: "Price was shared; the cost of the current pain was not." },
        { id: "economic_buyer", depth: featured ? "developing" : "surface", confidence: 0.7, evidence: featured ? [ev(transcript, "L8", "It ends up with our COO")] : [ev(transcript, "L6", "review it with the team next week")], gap: featured ? "COO is named; access is not booked." : "Team review is not a named buyer." },
        { id: "decision_criteria", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L3", "migration timing worries me")], gap: "Objections are criteria in disguise and were never ranked." },
        { id: "decision_process", depth: "surface", confidence: 0.7, evidence: [ev(transcript, "L6", "review it with the team next week")], gap: "Next week is a window, not a path." },
        { id: "champion", depth: "missing", confidence: 0.8, evidence: [], gap: "No internal seller was equipped." },
      ],
    };
  }
  return {
    callType: "discovery",
    overallNote: `Strong pain confirmation and a dated next step. ${spec.buyer} wants to move this quarter if rollout matches the demo.`,
    contextFlags: featured ? [] : ["short_call"],
    traits: [
      { id: "identify_pain", depth: "mastery", confidence: 0.95, evidence: [ev(transcript, "L2", spec.pain)], gap: "" },
      { id: "metrics", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L3", spec.price)], gap: "Price is on the table; the cost of the pain was not converted to dollars." },
      { id: "economic_buyer", depth: "developing", confidence: 0.75, evidence: [ev(transcript, "L4", "That works for our budget")], gap: "Budget comfort is not the same as named sign-off." },
      { id: "decision_criteria", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L4", "If rollout goes like the demo")], gap: "Rollout-quality is a criterion; it was never ranked against the incumbent." },
      { id: "decision_process", depth: "developing", confidence: 0.8, evidence: [ev(transcript, "L5", "rollout plan on Thursday at ten")], gap: "Thursday is booked; steps between demo and signature were not mapped." },
      { id: "champion", depth: featured ? "developing" : "missing", confidence: 0.7, evidence: featured ? [ev(transcript, "L8", "She signs off on tooling with me")] : [], gap: featured ? "Ops lead is invited, not equipped." : "No second thread on this call." },
    ],
  };
}

export function sampleMethodologyFor(
  spec: SampleCallSpec,
  transcript: TranscriptLine[],
) {
  const packId = packIdFor(spec);
  const pack = getMethodologyPack(packId);
  if (!pack) throw new Error(`sample-data: missing pack ${packId}`);
  const verdict = sampleMethodologyVerdict(spec, transcript);
  const card = applyMethodologyVerdict(pack, transcript, verdict, {
    dealValueUsd: dealValueFor(spec),
  });
  return {
    packId,
    dealValueUsd: dealValueFor(spec),
    scoredAt: SAMPLE_SIGNALS_NOW,
    verdict,
    card,
  };
}

function daysAgoIso(days: number): string {
  return new Date(Date.parse(SAMPLE_SIGNALS_NOW) - days * 86_400_000).toISOString();
}

export function sampleSignalsFor(spec: SampleCallSpec): DealSignal[] {
  const company = spec.company;
  if (spec.stage === "support") {
    return [
      {
        type: "support_ticket",
        company,
        at: daysAgoIso(Math.min(spec.daysAgo, 2)),
        summary: spec.title.replace(/^Support:\s*/i, ""),
        attrs: { status: "escalated", body: spec.pain },
      },
    ];
  }
  if (spec.stage === "customer_success") {
    return [
      {
        type: "renewal_window",
        company,
        at: daysAgoIso(0),
        summary: "Renewal approaching",
        attrs: { daysUntil: 40 },
      },
      {
        type: "usage",
        company,
        at: daysAgoIso(1),
        summary: "Adoption dip on the gap discussed on the call",
        attrs: { metric: "active_users", direction: "drop", pct: 18 },
      },
    ];
  }
  if (spec.stage === "at_risk") {
    const slug = spec.competitor.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return [
      {
        type: "website_visit",
        company,
        at: daysAgoIso(1),
        summary: `Viewed /compare/${slug}-alternative`,
        attrs: { path: `/compare/${slug}-alternative`, count: 1 },
      },
      {
        type: "inactivity",
        company,
        at: daysAgoIso(0),
        summary: "Gone quiet after the last call",
        attrs: { daysSince: 12, lastActivity: spec.title },
      },
      {
        type: "competitor_mention",
        company,
        at: daysAgoIso(spec.daysAgo),
        summary: spec.competitor,
        attrs: { competitor: spec.competitor, where: "call" },
      },
      {
        type: "commitment",
        company,
        at: daysAgoIso(spec.daysAgo),
        summary: "Rep promised a follow-up note",
        attrs: {
          owner: "rep",
          promise: "Send a short note if anything changes",
          due: daysAgoIso(Math.max(spec.daysAgo - 1, 0)).slice(0, 10),
          status: "overdue",
          sourceLineId: "L1",
        },
      },
    ];
  }
  return [
    {
      type: "website_visit",
      company,
      at: daysAgoIso(1),
      summary: "Viewed /pricing",
      attrs: { path: "/pricing", count: 2 },
    },
    {
      type: "website_visit",
      company,
      at: daysAgoIso(2),
      summary: "Viewed /pricing",
      attrs: { path: "/pricing", count: 1 },
    },
    {
      type: "meeting_event",
      company,
      at: daysAgoIso(0),
      summary: "Next meeting booked",
      attrs: { kind: "booked", label: spec.title },
    },
    {
      type: "email_event",
      company,
      at: daysAgoIso(4),
      summary: `Proposal — ${spec.company}`,
      attrs: { kind: spec.stage === "steady" ? "not_opened" : "opened", daysSince: 4 },
    },
  ];
}

export function sampleSignalFeedFor(
  spec: SampleCallSpec,
  transcript: TranscriptLine[],
): DealSignalFeed {
  return evaluateDealSignals({
    company: spec.company,
    transcript,
    signals: sampleSignalsFor(spec),
    dealValueUsd: dealValueFor(spec),
    now: SAMPLE_SIGNALS_NOW,
    mode: "demo",
  });
}

/** Deal-signal feed for a seeded dummy run, or null when the slug is not ours. */
export function sampleDatasetFeedForRun(run: {
  sampleSlug?: string;
  transcript: TranscriptLine[];
}): DealSignalFeed | null {
  const spec = specForSampleSlug(run.sampleSlug);
  if (!spec) return null;
  return sampleSignalFeedFor(spec, run.transcript);
}
