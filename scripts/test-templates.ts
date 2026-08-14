/**
 * Template routed follow-up email: the library, the router, the parser, the
 * screen, and the model tier ladder. All offline. The model is always a stub
 * here, because what is under test is the machinery that decides whether an
 * invented line can reach an outbound email.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { validateDealNotes } from "../src/lib/harness/gates";
import {
  backedClaims,
  buildPrompt,
  generateRoutedFollowUp,
  generateTemplateEmail,
  openRepPromises,
  parseDraft,
  renderContext,
  routeTemplate,
  routeWithTrace,
  TEMPLATE_FILES,
  templateLibrary,
  validateTemplate,
  type LlmTier,
  type Template,
} from "../src/lib/template-email";
import { deriveFacets } from "../src/lib/template-facets";
import {
  DealNotesSchema,
  RunRecordSchema,
  type Claim,
  type ClaimStatus,
  type DealNotes,
  type TranscriptLine,
} from "../src/lib/types";

const TEMPLATES_DIR = join(process.cwd(), "templates");
const library = templateLibrary();
const byId = (id: string): Template => {
  const found = library.find((t) => t.id === id);
  assert.ok(found, `template ${id} is in the library`);
  return found;
};

// ── fixtures ────────────────────────────────────────────────────────────────

function claim(
  id: string,
  text: string,
  status: ClaimStatus = "verified",
  lineId = "L1",
): Claim {
  return {
    id,
    text,
    evidence: { lineId, quote: "a sentence the gate already matched in the call" },
    status,
  };
}

function notes(over: Partial<DealNotes> = {}): DealNotes {
  return {
    title: "Brightsmile demo (model authored headline, fourteen locations)",
    summary: [claim("summary[0]", "The demo landed with the buyer.")],
    objections: [
      claim("objections[0]", "The downtime concern was addressed on the call."),
    ],
    intent: [claim("intent[0]", "Buyer plans to standardize on one vendor.")],
    nextSteps: [claim("nextSteps[0]", "Rep to send the SOC 2 report by Friday.")],
    pain: [],
    pricing: [],
    competitors: [],
    followUpEmail: {
      subject: "Follow-up: our call",
      body: "Thanks for our call.",
      evidence: { lineId: "L1", quote: "a sentence the gate already matched" },
      status: "verified",
    },
    ...over,
  };
}

const base = notes();

const goodPayload = {
  subject: "Save 40% on the annual plan today",
  greeting: "Hi Rahul,",
  opener: "Thanks for the time on the demo.",
  bullets: [
    { claim_id: "summary[0]", group: "outcome", text: "The demo landed." },
    {
      claim_id: "nextSteps[0]",
      group: "next_steps",
      text: "I will send the SOC 2 report by Friday.",
    },
  ],
  close: "Every line above came from something said on the call.",
  signoff: "Best,\nMaya",
};

const stub = (payload: unknown, model = "stub", source?: string) => async () => ({
  text: typeof payload === "string" ? payload : JSON.stringify(payload),
  model,
  source,
});

// ── the template files are the product ──────────────────────────────────────

describe("the template library", () => {
  it("ships nine files, and every one of them validates", () => {
    const onDisk = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
    assert.equal(onDisk.length, 9, "the starter library is 9 templates");
    assert.equal(TEMPLATE_FILES.length, 9, "every file on disk is wired in");
    for (const file of onDisk) {
      const raw = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), "utf8"));
      assert.doesNotThrow(() => validateTemplate(raw), `${file} must validate`);
    }
  });

  it("keeps ids, priorities and subjects unique and demo safe", () => {
    assert.equal(new Set(library.map((t) => t.id)).size, 9, "no duplicate ids");
    assert.equal(
      new Set(library.map((t) => t.priority)).size,
      9,
      "no two templates share a priority, so the ladder is total",
    );
    for (const t of library) {
      const words = t.subject.trim().split(/\s+/).length;
      assert.ok(words >= 3 && words <= 5, `${t.id} subject is 3 to 5 words, got ${words}`);
      assert.ok(!/[—–]/.test(JSON.stringify(t)), `${t.id} carries a dash`);
    }
  });

  it("fails loudly on a broken file instead of routing to nothing", () => {
    const good = library[0]!;
    assert.throws(() => validateTemplate(null), /template must be an object/);
    assert.throws(() => validateTemplate({}), /id must be a non-empty string/);
    assert.throws(
      () => validateTemplate({ ...good, routing: { trigger: { none_of: [{ section: "pain" }] } } }),
      /at least one any_of or all_of/,
    );
    assert.throws(
      () =>
        validateTemplate({
          ...good,
          routing: { trigger: { any_of: [{ section: "pain" }], sometimes: [] } },
        }),
      /unknown trigger key/,
    );
    assert.throws(
      () => validateTemplate({ ...good, blocks: [{ type: "slot", role: "nonsense", section: "pain" }] }),
      /slot role must be/,
    );
    assert.throws(
      () =>
        validateTemplate({
          ...good,
          routing: { trigger: { all_of: [{ scope: "deal", metric: "vibes" }] } },
        }),
      /unknown deal metric/,
    );
  });
});

// ── the gate decides what routing may read ──────────────────────────────────

describe("routing reads gate-passed claims only", () => {
  const priced = (status: ClaimStatus) =>
    notes({
      pricing: [
        claim("pricing[0]", "CallForge quote: twenty eight per seat per month.", status),
      ],
    });

  it("never fires off a claim the call could not back", () => {
    const t = [byId("pricing-followup")];
    assert.equal(
      routeWithTrace(priced("uncorroborated"), t, {}).template,
      null,
      "a quote the call cannot back is not a pricing call",
    );
    assert.ok(routeWithTrace(priced("verified"), t, {}).template, "the same claim, backed, fires it");
  });

  it("never fires off a blocked claim", () => {
    const t = [byId("pricing-followup")];
    assert.equal(
      routeWithTrace(priced("blocked_injection"), t, {}).template,
      null,
      "a planted discount can never pick a template",
    );
  });

  it("treats a corrected citation as emailable, so it can route", () => {
    const corrected = priced("segment_corrected");
    assert.ok(routeWithTrace(corrected, [byId("pricing-followup")], {}).template);
    assert.equal(backedClaims(corrected).filter((c) => c.section === "pricing").length, 1);
  });
});

describe("the ladder", () => {
  it("picks one template, and says which triggers said no first", () => {
    const trace = routeWithTrace(base, TEMPLATE_FILES, {});
    assert.equal(trace.template?.id, "post-demo-followup");
    const order = trace.considered.map((c) => c.id);
    assert.ok(
      order.indexOf("no-next-step-reengagement") < order.indexOf("post-demo-followup"),
      "the ladder walks in priority order",
    );
    assert.equal(trace.considered.filter((c) => c.fired).length >= 1, true);
  });

  it("falls to the recap template when no sharper situation matched", () => {
    const quiet = notes({
      summary: [claim("summary[0]", "A short call happened.")],
      objections: [],
      nextSteps: [claim("nextSteps[0]", "Rep to send the SOC 2 report by Friday.")],
    });
    assert.equal(
      routeTemplate(quiet, TEMPLATE_FILES, {})?.id,
      "post-call-recap",
      "a backed call gets the catch-all rather than an empty panel",
    );
  });

  it("returns null when nothing was backed, or the library is empty", () => {
    const unbacked = notes({
      summary: [claim("summary[0]", "Nothing here held up.", "uncorroborated")],
      objections: [],
      intent: [],
      nextSteps: [],
    });
    assert.equal(
      routeTemplate(unbacked, TEMPLATE_FILES, {}),
      null,
      "no backed claim means no template, catch-all included",
    );
    assert.equal(routeTemplate(base, [], {}), null, "an empty library returns null");
    assert.equal(routeTemplate(base, null, {}), null);
  });

  it("lets the caller force a library template instead of auto-match", () => {
    const forced = routeWithTrace(base, TEMPLATE_FILES, {
      templateId: "pricing-followup",
    });
    assert.equal(forced.template?.id, "pricing-followup");
    assert.equal(
      forced.considered.find((c) => c.id === "post-demo-followup")?.fired,
      true,
      "auto-match still shows up in the considered ladder",
    );

    assert.throws(
      () =>
        routeWithTrace(base, TEMPLATE_FILES, { templateId: "not-a-real-template" }),
      (err: unknown) =>
        err instanceof Error &&
        (err as { code?: string }).code === "TEMPLATE_NOT_FOUND",
    );
  });

  it("survives sparse and malformed claim rows", () => {
    const messy = notes({
      pricing: [
        null as unknown as Claim,
        "not a claim" as unknown as Claim,
        { id: "pricing[9]" } as unknown as Claim,
      ],
    });
    assert.doesNotThrow(() => routeTemplate(messy, TEMPLATE_FILES, {}));
    assert.doesNotThrow(() =>
      routeTemplate(base, TEMPLATE_FILES, {
        deal: { daysSinceLastCall: Number("soon") },
      }),
    );
  });

  it("calls a bundle that is not a bundle a programmer error", () => {
    assert.throws(
      () => routeTemplate(null as unknown as DealNotes, TEMPLATE_FILES, {}),
      /ROUTE_INPUT_INVALID|claim sections/,
    );
  });
});

describe("deal-scope triggers", () => {
  it("fires the ghosted nudge on silence, and never on a deal with no dates", () => {
    const t = [byId("ghosted-deal-nudge")];
    assert.equal(
      routeWithTrace(base, t, { deal: { daysSinceLastCall: 21 } }).template?.id,
      "ghosted-deal-nudge",
    );
    assert.equal(routeWithTrace(base, t, { deal: { daysSinceLastCall: 3 } }).template, null);
    assert.equal(routeWithTrace(base, t, {}).template, null);
  });

  it("needs an earlier call that left a rep promise before the ledger fires", () => {
    const t = [byId("commitment-fulfillment")];
    const deal = { priorCalls: [{ callId: "call-1", notes: base }] };
    assert.ok(routeWithTrace(base, t, { deal }).template, "fires with the deal history behind it");
    assert.equal(
      routeWithTrace(base, t, {}).template,
      null,
      "the same call alone has no ledger to reconcile",
    );
  });

  it("namespaces a prior-call promise by call, so two calls cannot be confused", () => {
    const promises = openRepPromises({ priorCalls: [{ callId: "call-1", notes: base }] });
    assert.equal(promises.length, 1);
    assert.equal(promises[0]!.id, "call-1:nextSteps[0]");
  });
});

// ── the model's input ───────────────────────────────────────────────────────

describe("what the model is allowed to see", () => {
  const template = byId("post-demo-followup");

  it("offers backed claims only, and never a transcript", () => {
    const withUnbacked = notes({
      competitors: [claim("competitors[0]", "A rival was named.", "uncorroborated")],
    });
    const ctx = renderContext(withUnbacked, template, {});
    assert.ok(ctx.allowed_ids.length > 0);
    assert.ok(!ctx.allowed_ids.includes("competitors[0]"), "an unbacked claim is never offered");
    const sent = JSON.stringify(buildPrompt(ctx));
    assert.ok(!sent.includes("transcript"), "no transcript reaches the model input");
    for (const c of ctx.claims) assert.ok(c.id && c.text, "every offered claim carries its id and text");
  });

  it("drops an empty slot instead of filling it with a plausible line", () => {
    const ctx = renderContext(base, byId("pricing-followup"), {});
    for (const block of ctx.blocks) {
      if (block.type === "slot") assert.ok(block.claims.length > 0);
    }
  });

  it("degrades to a named reason when every slot the template wants is empty", async () => {
    // The trigger still fires. The claims this stripped version asks for are
    // all in a section this call never produced, and nothing to say is a valid
    // answer.
    const stripped = {
      ...byId("post-demo-followup"),
      blocks: byId("post-demo-followup").blocks.filter(
        (b) => b.type !== "slot" || b.section === "pricing",
      ),
    };
    const res = await generateTemplateEmail(base, [stripped], { complete: stub("{}") });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "no_backed_claims_for_template");
  });

  it("carries the citable ids and the voice rules into the prompt", () => {
    const prompt = buildPrompt(renderContext(base, template, {}));
    assert.match(prompt.system, /Never invent an id/);
    assert.match(prompt.system, /No dashes as punctuation/);
    assert.match(
      prompt.system,
      /sales rep writing a polished follow-up email directly to the customer/,
    );
    assert.match(
      prompt.system,
      /"I" or "we" for the rep and "you" for the customer/,
    );
    assert.match(prompt.system, /Never call either person "the rep"/);
    assert.match(prompt.system, /complete, natural sentences/);
    assert.match(prompt.system, /Never mention claims, citations, evidence/);
    assert.match(prompt.user, /nextSteps\[0\]/);
    assert.equal(prompt.messages.length, 2);
  });
});

// ── the parser and the screen ───────────────────────────────────────────────

describe("the screen still owns every asserting line", () => {
  it("brings a clean draft back with its claim ids intact", async () => {
    const res = await generateTemplateEmail(base, TEMPLATE_FILES, {
      complete: stub(goodPayload),
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.template_id, "post-demo-followup");
    assert.equal(res.email.provenance.cut, 0);
    assert.deepEqual(res.email.bullets.map((b) => b.claimId), ["summary[0]", "nextSteps[0]"]);
    assert.match(res.email.body, /SOC 2 report/);
  });

  it("cuts an invented line with no citation, and counts the cut", async () => {
    const payload = {
      ...goodPayload,
      bullets: [
        ...goodPayload.bullets,
        { group: "next_steps", text: "You agreed to sign by Friday." },
      ],
    };
    const res = await generateTemplateEmail(base, TEMPLATE_FILES, { complete: stub(payload) });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.email.provenance.cut, 1);
    assert.ok(!res.email.body.includes("agreed to sign"), "the invented line never reaches the body");
  });

  it("rejects the WHOLE draft on a citation the gate never passed", async () => {
    const payload = {
      ...goodPayload,
      bullets: [...goodPayload.bullets, { claim_id: "nextSteps[99]", group: "recap", text: "invented" }],
    };
    const res = await generateTemplateEmail(base, TEMPLATE_FILES, { complete: stub(payload) });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "draft_rejected_unknown_citation");
    assert.ok(!("email" in res), "nothing survives a rejected draft");
  });

  it("rejects the whole draft on a claim the call could not back, never trims it", async () => {
    const withUnbacked = notes({
      competitors: [claim("competitors[0]", "A rival undercut us by half.", "uncorroborated")],
    });
    const payload = {
      ...goodPayload,
      bullets: [
        ...goodPayload.bullets,
        { claim_id: "competitors[0]", group: "recap", text: "A rival undercut us by half." },
      ],
    };
    const res = await generateTemplateEmail(withUnbacked, TEMPLATE_FILES, {
      complete: stub(payload),
    });
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "draft_rejected_unknown_citation");
  });

  it("drops a backed claim the template never offered, rather than smuggling it in", async () => {
    const payload = {
      ...goodPayload,
      bullets: [
        ...goodPayload.bullets,
        { claim_id: "intent[0]", group: "recap", text: "You are standardizing on one vendor." },
      ],
    };
    const res = await generateTemplateEmail(base, TEMPLATE_FILES, { complete: stub(payload) });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.email.provenance.offTemplateCut, 1);
    assert.equal(res.email.provenance.cut, 1);
    assert.ok(!res.email.body.includes("standardizing on one vendor"));
  });

  it("degrades malformed model output to a named reason, never a crash", async () => {
    const cases: Array<[string, string]> = [
      ['{"subject":"x","bullets":[{"claim_id":"summary[0]","text":"a"', "draft_unparseable"],
      ["not json at all", "draft_unparseable"],
      ['{"subject":"x","greeting":"hi"}', "draft_malformed"],
      ['{"bullets":[]}', "draft_malformed"],
      ['{"bullets":[{"claim_id":"summary[0]"}]}', "draft_malformed"],
    ];
    for (const [text, reason] of cases) {
      const res = await generateTemplateEmail(base, TEMPLATE_FILES, { complete: stub(text) });
      assert.equal(res.ok, false, `${text.slice(0, 20)} must not succeed`);
      assert.equal(res.ok === false && res.reason, reason);
      assert.ok(res.ok === false && res.error, "the reason carries the detail a rebuild needs");
    }
  });

  it("degrades a failed model call to the baseline, with the reason named", async () => {
    const failed = await generateTemplateEmail(base, TEMPLATE_FILES, {
      complete: async () => {
        throw new Error("chat/completions returned 503");
      },
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.ok === false && failed.reason, "llm_call_failed");
  });

  it("fills the routed template deterministically when there is no LLM tier", async () => {
    const keyless = await generateTemplateEmail(base, TEMPLATE_FILES, {
      tier: { source: "offline" },
    });
    assert.equal(keyless.ok, true);
    if (!keyless.ok) return;
    assert.equal(keyless.template_id, "post-demo-followup");
    assert.equal(keyless.email.provenance.source, "deterministic");
    assert.match(keyless.email.body, /downtime concern was addressed/i);
    assert.match(keyless.email.body, /SOC 2 report by Friday/);
    assert.match(keyless.email.body, /What we covered:/);
  });

  it("still parses a fenced JSON answer, because models fence things", () => {
    const ctx = renderContext(base, byId("post-demo-followup"), {});
    const draft = parseDraft("```json\n" + JSON.stringify(goodPayload) + "\n```", ctx);
    assert.equal(draft.bullets.length, 2);
    assert.equal(draft.bullets[0]!.claim_id, "summary[0]");
  });
});

// ── the neutral subject rule from the gate PR ───────────────────────────────

describe("a model authored subject never reaches the envelope", () => {
  it("ships the subject the template file declares", async () => {
    const res = await generateTemplateEmail(base, TEMPLATE_FILES, { complete: stub(goodPayload) });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.email.subject, byId("post-demo-followup").subject);
    assert.ok(!res.email.subject.includes("40%"), "the model's subject is read and dropped");
    assert.ok(
      !res.email.subject.includes(base.title),
      "the model authored run title never rides onto the envelope either",
    );
  });
});

// ── the tier ladder ─────────────────────────────────────────────────────────

describe("the tier ladder", () => {
  const explode = async () => {
    throw new Error("Ollama must never be probed when a key is configured");
  };

  it("lets a configured key win outright, without probing Ollama", async () => {
    const { resolveLlmTier } = await import("../src/lib/template-email");
    const tier = await resolveLlmTier({
      env: { LLM_API_KEY: "k-123", LLM_BASE_URL: "https://api.groq.com/openai/v1", LLM_MODEL: "llama-3.3-70b-versatile" },
      detect: explode,
    });
    assert.equal(tier.source, "configured");
    assert.equal(tier.source === "configured" && tier.apiKey, "k-123");
    assert.equal(tier.source === "configured" && tier.model, "llama-3.3-70b-versatile");
  });

  it("does not probe on a key with no endpoint behind it either", async () => {
    const { resolveLlmTier } = await import("../src/lib/template-email");
    const tier = await resolveLlmTier({ env: { LLM_API_KEY: "k-123" }, detect: explode });
    assert.equal(tier.source, "offline");
  });

  it("takes the local tier when there is no key and Ollama answers", async () => {
    const { resolveLlmTier } = await import("../src/lib/template-email");
    const tier = await resolveLlmTier({
      env: {},
      detect: async (opts) => {
        assert.deepEqual(opts.env, {}, "the probe gets the env the resolver was given");
        return { baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2:3b", source: "ollama-local" };
      },
    });
    assert.equal(tier.source, "ollama-local");
    assert.equal(tier.source === "ollama-local" && tier.apiKey, "ollama");
    assert.equal(tier.source === "ollama-local" && tier.model, "llama3.2:3b");
  });

  it("falls to offline when there is no key and no Ollama", async () => {
    const { resolveLlmTier } = await import("../src/lib/template-email");
    assert.deepEqual(await resolveLlmTier({ env: {}, detect: async () => null }), {
      source: "offline",
    });
  });

  it("names where the model ran, and suffixes the local tier only", async () => {
    const configured = await generateTemplateEmail(base, TEMPLATE_FILES, {
      complete: stub(goodPayload, "llama-3.3-70b-versatile", "configured"),
    });
    assert.equal(configured.ok === true && configured.email.provenance.model, "llama-3.3-70b-versatile");

    const local = await generateTemplateEmail(base, TEMPLATE_FILES, {
      complete: stub(goodPayload, "llama3.2:3b", "ollama-local"),
    });
    assert.equal(local.ok === true && local.email.provenance.source, "ollama-local");
    assert.equal(
      local.ok === true && local.email.provenance.model,
      "llama3.2:3b via local Ollama",
    );
  });

  it("still ships a deterministic template fill when there is no key and no Ollama", async () => {
    const offline: LlmTier = { source: "offline" };
    const routed = await generateRoutedFollowUp(base, { tier: offline });
    assert.ok(routed);
    assert.equal(routed!.template.id, "post-demo-followup");
    assert.equal(routed!.provenance.source, "deterministic");
    assert.match(routed!.body, /downtime concern was addressed/i);

    const quiet = await generateRoutedFollowUp(notes({ pricing: [] }), {
      tier: offline,
    });
    assert.ok(quiet, "a call with backed claims still gets a template when offline");
    assert.equal(quiet!.provenance.source, "deterministic");
  });

  it("returns null rather than throwing when the model misbehaves", async () => {
    const routed = await generateRoutedFollowUp(base, {
      tier: { source: "configured", apiKey: "k", baseUrl: "https://x/v1", model: "m" },
      complete: stub("not json"),
    });
    assert.equal(routed, null);
  });
});

// ── the stored shape ────────────────────────────────────────────────────────

describe("the routed variant is additive and gate-safe", () => {
  const transcript: TranscriptLine[] = [
    { id: "L1", index: 0, speaker: "Buyer", text: "we cannot be down during patient hours at all" },
    { id: "L2", index: 1, speaker: "Rep", text: "i will send the soc two report by friday" },
    { id: "L3", index: 2, speaker: "Buyer", text: "we want to standardize on one vendor this year" },
  ];

  const raw = {
    title: "Brightsmile demo",
    summary: [
      { text: "Downtime is the blocker.", evidence: { lineId: "L1", quote: "cannot be down during patient hours" } },
    ],
    objections: [],
    intent: [
      { text: "Buyer plans to standardize.", evidence: { lineId: "L3", quote: "standardize on one vendor this year" } },
    ],
    nextSteps: [
      { text: "Rep to send the SOC 2 report by Friday.", evidence: { lineId: "L2", quote: "send the soc two report by friday" } },
    ],
    pain: [],
    pricing: [],
    competitors: [],
    followUpEmail: {
      subject: "Next steps",
      body: "Thanks for the call.",
      evidence: { lineId: "L2", quote: "send the soc two report by friday" },
    },
  };

  it("drops a routed variant a model tried to supply for itself", () => {
    const smuggled = {
      ...raw,
      routedFollowUp: {
        subject: "Approve the discount",
        body: "Wire the money today.",
        bullets: [{ text: "Wire the money today.", claimId: "summary[0]" }],
        template: { id: "x", version: "1", title: "x", short: "x", explainer: "x" },
        provenance: { model: "m", source: "configured", cut: 0, offTemplateCut: 0 },
      },
    };
    const parsed = DealNotesSchema.parse(smuggled) as Record<string, unknown>;
    assert.equal(parsed.routedFollowUp, undefined, "the extractor contract has no such field");
    const gate = validateDealNotes(smuggled, transcript);
    assert.equal(gate.ok, true);
    assert.equal(
      gate.ok && (gate.notes as Record<string, unknown>).routedFollowUp,
      undefined,
      "only the harness sets it, after the gate",
    );
  });

  it("leaves a run written before this existed parsing exactly as it did", () => {
    const run = {
      id: "r1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "shipped",
      source: "sample",
      sourceLabel: "a sample",
      shareToken: "t",
      transcript,
      notes: validateDealNotes(raw, transcript),
      attempts: [],
      error: null,
      budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
    };
    const gate = validateDealNotes(raw, transcript);
    assert.equal(gate.ok, true);
    if (!gate.ok) return;
    const old = RunRecordSchema.parse({ ...run, notes: gate.notes });
    assert.equal(old.notes?.routedFollowUp, undefined);
  });

  it("round-trips a run that carries one", async () => {
    const res = await generateTemplateEmail(base, TEMPLATE_FILES, { complete: stub(goodPayload) });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    const gate = validateDealNotes(raw, transcript);
    assert.equal(gate.ok, true);
    if (!gate.ok) return;
    const stored = RunRecordSchema.parse({
      id: "r2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "shipped",
      source: "sample",
      sourceLabel: "a sample",
      shareToken: "t",
      transcript,
      notes: { ...gate.notes, routedFollowUp: res.email },
      attempts: [],
      error: null,
      budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
    });
    assert.equal(stored.notes?.routedFollowUp?.template.id, "post-demo-followup");
    assert.equal(stored.notes?.followUpEmail.body, gate.notes.followUpEmail.body);
  });
});

// ── the derived facets ──────────────────────────────────────────────────────

describe("routing facets", () => {
  it("reads a next step for what kind it is and who carries it", () => {
    assert.deepEqual(deriveFacets("next_steps", "Rep to send the SOC 2 report by Friday."), {
      type: "concrete_date",
      owner: "rep",
    });
    assert.deepEqual(deriveFacets("next_steps", "Rep to send the agreement."), {
      type: "send_info",
      owner: "rep",
    });
    assert.deepEqual(deriveFacets("next_steps", "Both sides to circle back."), {
      type: "soft_followup",
      owner: "joint",
    });
    assert.equal(
      deriveFacets("next_steps", "No next step was agreed on this call.").type,
      "no_next_step",
    );
  });

  it("leaves a facet undefined when the claim never says it", () => {
    assert.deepEqual(deriveFacets("next_steps", "Something happened on the call."), {
      type: undefined,
      owner: undefined,
    });
    assert.equal(deriveFacets("pricing", "A conversation was had.").kind, undefined);
    assert.deepEqual(deriveFacets("summary", "Anything at all."), {});
  });

  it("holds an objection open unless the call says the buyer took the answer", () => {
    assert.equal(
      deriveFacets("objections", "Downtime is a dealbreaker.").objection_status,
      "left_open",
    );
    assert.equal(deriveFacets("objections", "Downtime is a dealbreaker.").handling, "unhandled");
    assert.equal(
      deriveFacets("objections", "The buyer accepted the porting proof.").objection_status,
      "buyer_accepted",
    );
  });

  it("keeps an undefined facet from ever satisfying a where clause", () => {
    const vague = notes({
      pricing: [claim("pricing[0]", "Money came up on the call.")],
    });
    assert.equal(
      routeWithTrace(vague, [byId("pricing-followup")], {}).template,
      null,
      "ambiguity costs the template its turn",
    );
  });
});
