/**
 * The analysis screen's acceptance checklist, as tests.
 *
 * Every case here is one line of the spec Sourav wrote after a real call was
 * run through the deployment: good content with an imperfect citation was
 * demoted, three repairs answered with a placeholder, keyword templates
 * shipped as fully backed, and the page printed the harness's own addressing
 * at the reader. The regexes at the bottom run over the rendered HTML, so a
 * future refactor cannot put any of it back.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildAnalysisView,
  groupStepsByOwner,
  isCategoryNote,
  isSentinelEvidence,
  orderNotesForRender,
  shouldShowSpeakers,
  spokenDue,
  type NoteView,
} from "../src/lib/analysis-view";
import { DealNotesView } from "../src/components/DealNotesView";
import {
  hasPlaceholderEvidence,
  isPlaceholderQuote,
  repairInstructions,
  repairPrompt,
  sanitizeFailuresForPrompt,
  shouldDiscardRepair,
} from "../src/lib/harness/repair";
import {
  callTimeLabel,
  callTitle,
  speakerDisplayName,
} from "../src/lib/labels";
import type { Claim, RunRecord, TranscriptLine } from "../src/lib/types";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** A mono call: one audio stream, and a diarizer that guessed a third voice. */
const MONO: TranscriptLine[] = [
  {
    id: "L1",
    index: 0,
    speaker: "Rep",
    text: "thanks for making the time today brianne i want to understand what you are running now",
    startMs: 0,
  },
  {
    id: "L2",
    index: 1,
    speaker: "Prospect",
    text: "we need to track phone calls and record them and send texts for the sales team",
    startMs: 41_000,
  },
  {
    id: "L3",
    index: 2,
    speaker: "Speaker 3",
    text: "pricing is the other thing we pay about forty per seat right now on the renewal",
    startMs: 95_000,
  },
  {
    id: "L4",
    index: 3,
    speaker: "Rep",
    text: "i will send the comparison over on thursday so you can take it to your team",
    startMs: 132_000,
  },
];

function claim(
  text: string,
  lineId: string,
  quote: string,
  status: Claim["status"],
): Claim {
  return { id: `${lineId}-${text.slice(0, 8)}`, text, evidence: { lineId, quote }, status };
}

/**
 * The shape the live run produced: a correct summary the gate could not
 * verify against messy speech-to-text, keyword templates that verified
 * trivially, and the harness sentinel where a citation belongs.
 */
function messyRun(overrides: Partial<RunRecord> = {}): RunRecord {
  const notes = {
    title: "Brianne discovery call (keyword extractor: limited, deterministic)",
    summary: [
      claim(
        "Brianne is looking for a way to track phone calls, record them, and send texts for her sales team.",
        "L2",
        "track phone calls and record them and send texts",
        "uncorroborated",
      ),
      claim(
        "A need or evaluation driver came up on the call.",
        "L2",
        "we need to track phone calls and record them and send texts for the sales team",
        "verified",
      ),
      claim(
        "Pricing, seats, or renewal came up on the call.",
        "L3",
        "pricing is the other thing we pay about forty per seat right now on the renewal",
        "verified",
      ),
      claim(
        "Brianne's team is on a renewal she called expensive.",
        "L3",
        "the renewal is expensive and we want out of it",
        "uncorroborated",
      ),
    ],
    objections: [] as Claim[],
    intent: [
      claim(
        "A vendor decision was referenced on the call.",
        "L3",
        "pricing is the other thing we pay about forty per seat right now",
        "verified",
      ),
    ],
    nextSteps: [
      claim(
        "Rep will send the comparison on Thursday for Brianne to take to her team.",
        "L4",
        "i will send the comparison over on thursday",
        "verified",
      ),
      claim(
        "A date or checkpoint was mentioned.",
        "L4",
        "i will send the comparison over on thursday so you can take it to your team",
        "verified",
      ),
    ],
    pain: [] as Claim[],
    pricing: [
      claim(
        "Buyer pays about forty per seat on the current renewal.",
        "__unsupported__",
        "(no supporting line found in this call)",
        "uncorroborated",
      ),
    ],
    competitors: [] as Claim[],
    followUpEmail: {
      subject: "Next steps",
      body: "Thanks again for the conversation.",
      evidence: { lineId: "L4", quote: "i will send the comparison over on thursday" },
      status: "uncorroborated" as const,
    },
    coverage: {
      band: "FAILED_UNPROVEN" as const,
      ratio: 0.71,
      stats: {
        verified: 5,
        segment_corrected: 0,
        uncorroborated: 2,
        blocked_injection: 0,
        attempted: 7,
        corroborated: 5,
      },
    },
    notesSource: "model" as const,
  };

  return {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    status: "failed",
    source: "upload",
    sourceLabel: "brianne-call.mp3",
    shareToken: "abcdef0123456789",
    transcript: MONO,
    notes,
    attempts: [
      { attempt: 1, at: new Date(0).toISOString(), ok: false, reason: "pyai_recap", failures: [] },
      {
        attempt: 2,
        at: new Date(0).toISOString(),
        ok: false,
        reason: "repair_placeholder_discarded",
        failures: [
          {
            code: "repair_placeholder",
            message: "The repair wrote a stand-in where a copied line belongs.",
          },
        ],
      },
    ],
    error: null,
    budget: { maxAttempts: 3, maxTokensEstimate: 8000, deadlineMs: 180000 },
    ...overrides,
  } as RunRecord;
}

function render(run: RunRecord): string {
  return renderToStaticMarkup(<DealNotesView run={run} />);
}

/** What a reader actually sees: markup stripped, attributes gone. */
function renderedText(run: RunRecord): string {
  return render(run)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* 1. Quote-fidelity repair                                            */
/* ------------------------------------------------------------------ */

describe("the repair asks for a copied line, and refuses a stand-in", () => {
  it("tells the model what to DO, in words a retry can act on", () => {
    const text = repairInstructions();
    assert.match(text, /character for character/i);
    assert.match(text, /copied, not written/i);
    assert.match(
      text,
      /drop that note and keep the others/i,
      "the model has to be told the shorter answer is allowed",
    );
    assert.match(
      text,
      /no supporting line found in this call/i,
      "the exact string the model kept answering with is named as rejected",
    );
  });

  it("never teaches the placeholder by feeding the sentinel back", () => {
    const failures = [
      "uncorroborated @ summary[0]: (no supporting line found in this call)",
      "missing_line @ __unsupported__",
    ].join("\n");
    const clean = sanitizeFailuresForPrompt(failures);
    assert.doesNotMatch(clean, /__unsupported__/);
    assert.doesNotMatch(clean, /\(no supporting line found/i);
    const prompt = repairPrompt(failures, "[L1] Rep: hello there");
    assert.doesNotMatch(
      prompt.split("Hard rules")[1] ?? prompt,
      /__unsupported__/,
      "the sentinel never travels to the model as an example",
    );
    assert.match(prompt, /\[L1\] Rep: hello there/);
  });

  it("knows a stand-in from a copied sentence", () => {
    for (const bad of [
      "(no supporting line found in this call)",
      "N/A",
      "none",
      "[quote unavailable]",
      "__unsupported__",
      "",
      "   ",
      "no matching line found in the transcript",
    ]) {
      assert.equal(isPlaceholderQuote(bad), true, `should reject: ${bad}`);
    }
    for (const good of [
      "we need to track phone calls and record them",
      "we pay about forty per seat right now",
      "(laughs) yeah that is the one that hurts",
    ]) {
      assert.equal(isPlaceholderQuote(good), false, `should accept: ${good}`);
    }
  });

  it("finds a stand-in anywhere in a candidate answer", () => {
    const candidate = {
      title: "Discovery",
      summary: [
        {
          text: "Buyer wants call tracking",
          evidence: { lineId: "L2", quote: "we need to track phone calls" },
        },
      ],
      nextSteps: [
        {
          text: "Send the comparison",
          evidence: {
            lineId: "L4",
            quote: "(no supporting line found in this call)",
          },
        },
      ],
    };
    assert.equal(hasPlaceholderEvidence(candidate), true);
    assert.equal(
      hasPlaceholderEvidence({
        summary: [
          {
            text: "Buyer wants call tracking",
            evidence: { lineId: "L2", quote: "we need to track phone calls" },
          },
        ],
      }),
      false,
    );
  });

  it("discards a placeholder repair and keeps the demoted original", () => {
    const placeholderRepair = {
      summary: [
        {
          text: "Buyer wants call tracking",
          evidence: { lineId: "__unsupported__", quote: "(no supporting line found in this call)" },
        },
      ],
    };
    const realRepair = {
      summary: [
        {
          text: "Buyer wants call tracking",
          evidence: {
            lineId: "L2",
            quote: "we need to track phone calls and record them",
          },
        },
      ],
    };
    assert.equal(
      shouldDiscardRepair({ attempt: 2, holdingNotes: true, raw: placeholderRepair }),
      true,
      "a repair that writes a stand-in is thrown away",
    );
    assert.equal(
      shouldDiscardRepair({ attempt: 2, holdingNotes: true, raw: realRepair }),
      false,
      "a repair that copies a line is taken",
    );
    assert.equal(
      shouldDiscardRepair({ attempt: 1, holdingNotes: false, raw: placeholderRepair }),
      false,
      "a first pass is never discarded, because nothing is held behind it",
    );
  });
});

/* ------------------------------------------------------------------ */
/* 2. Fallback inversion                                               */
/* ------------------------------------------------------------------ */

describe("a demoted note about the call outranks a backed template line", () => {
  const demotedReal: NoteView = {
    key: "a",
    text: "Brianne is looking for a way to track phone calls and send texts.",
    status: "uncorroborated",
    callSpecific: true,
    source: null,
  };
  const backedTemplate: NoteView = {
    key: "b",
    text: "A need or evaluation driver came up on the call.",
    status: "verified",
    callSpecific: false,
    source: { lineId: "L2", quote: "we need to track phone calls", timeLabel: "0:41", speaker: null },
  };

  it("orders the demoted reading of the call first", () => {
    const ordered = orderNotesForRender([backedTemplate, demotedReal]);
    assert.deepEqual(
      ordered.map((n) => n.key),
      ["a", "b"],
    );
  });

  it("reads category text for what it is", () => {
    for (const template of [
      "A need or evaluation driver came up on the call.",
      "Pricing, seats, or renewal came up on the call.",
      "A date or checkpoint was mentioned.",
      "An incumbent or competing tool was named on the call.",
    ]) {
      assert.equal(isCategoryNote(template), true, template);
    }
    for (const real of [
      "Brianne is looking for a way to track phone calls and send texts.",
      "Pricing came up when Rahul countered with RingHawk's twenty two.",
      "Buyer pays forty per seat on the current renewal.",
    ]) {
      assert.equal(isCategoryNote(real), false, real);
    }
  });

  it("keeps template lines out of the notes and puts the topics in chips", () => {
    const view = buildAnalysisView(messyRun());
    const noteTexts = view.sections.flatMap((s) => [
      ...s.backed,
      ...s.unverified,
      ...s.blocked,
    ].map((n) => n.text));
    assert.ok(
      noteTexts.every((t) => !isCategoryNote(t)),
      `category text reached the notes: ${JSON.stringify(noteTexts)}`,
    );
    assert.ok(
      noteTexts.some((t) => t.includes("track phone calls")),
      "the reading of the call the model actually wrote has to survive",
    );
    assert.ok(view.topics.length > 0, "keyword hits become topic chips");
    for (const chip of view.topics) {
      const line = MONO.find((l) => l.id === chip.lineId);
      assert.ok(line, "a chip points at a real line");
      assert.ok(
        line!.text.includes(chip.quote),
        "a chip carries a verbatim slice of its own line as its receipt",
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. Per-note partial credit                                          */
/* ------------------------------------------------------------------ */

describe("the run verdict gates the email and nothing else", () => {
  it("renders every backed note on a run the harness marked failed", () => {
    const run = messyRun();
    assert.equal(run.status, "failed");
    const view = buildAnalysisView(run);
    const backed = view.sections.flatMap((s) => s.backed);
    assert.ok(
      backed.length > 0,
      "a run-level verdict must not blank note-level value",
    );
    assert.equal(view.email.held, true, "the email is the surface that closes");
    const html = render(run);
    assert.ok(html.includes("track phone calls"), "the notes are on the page");
    assert.ok(
      html.includes("send the comparison"),
      "a backed next step is on the page",
    );
  });

  it("still holds the email back when a run shipped but the draft did not clear", () => {
    const run = messyRun({ status: "partial" });
    const view = buildAnalysisView(run);
    assert.equal(view.email.held, true);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Render hygiene                                                   */
/* ------------------------------------------------------------------ */

describe("nothing internal reaches the page", () => {
  const html = render(messyRun());

  it("shows no sentinel and no placeholder quote", () => {
    assert.doesNotMatch(html, /__unsupported__/);
    assert.doesNotMatch(html, /no supporting line found/i);
  });

  it("gives a claim with no real evidence no source row at all", () => {
    const view = buildAnalysisView(messyRun());
    const unverified = view.sections.flatMap((s) => s.unverified);
    assert.ok(unverified.length > 0, "the fixture carries demoted notes");
    for (const note of unverified) {
      assert.equal(
        note.source,
        null,
        "absence of a citation is the information, so no source row is drawn",
      );
    }
    assert.equal(
      isSentinelEvidence({
        lineId: "__unsupported__",
        quote: "(no supporting line found in this call)",
      }),
      true,
    );
    assert.equal(
      isSentinelEvidence({ lineId: "L2", quote: "we need to track phone calls" }),
      false,
    );
  });

  it("shows no internal ids, enums, or try counts", () => {
    const text = renderedText(messyRun());
    assert.doesNotMatch(text, /\bL\d+\b/, "utterance ids never reach the DOM as text");
    assert.doesNotMatch(text, /\bu\d+\b/);
    assert.doesNotMatch(html, /uncorroborated|segment_corrected|blocked_injection/);
    assert.doesNotMatch(html, /FAILED_UNPROVEN|PARTIAL_LOW_COVERAGE|SHIPPED_WITH_CORRECTIONS/);
    assert.doesNotMatch(html, /Try #\d/);
    assert.doesNotMatch(html, /summary\[\d\]|nextSteps\[\d\]/);
    assert.doesNotMatch(
      html,
      /gate_unproven|pyai_recap|demo_extract|llm_fallback|repair_placeholder/,
      "reason codes get English in the drawer, never their own name",
    );
  });

  it("puts the pipeline's state in one drawer, never in the title", () => {
    assert.doesNotMatch(
      html,
      /keyword extractor: limited/,
      "the page title is the call, never the pipeline that read it",
    );
    const drawers = html.match(/<summary/g) ?? [];
    assert.equal(drawers.length, 1, "one collapsed drawer, at the end");
    assert.ok(html.includes("Run details"));
    assert.equal(
      callTitle("Brianne call (keyword extractor: limited, deterministic)", "x"),
      "Brianne call",
    );
  });

  it("says the fraction, never a bare percentage, and counts what it shows", () => {
    // The stored coverage says 5 of 7, because the gate also checked the
    // template lines and the email. The page holds those back, so it counts
    // the notes a reader can actually see instead of claiming backing for
    // notes nobody was shown.
    const view = buildAnalysisView(messyRun());
    const shownBacked = view.sections.flatMap((s) => s.backed).length;
    const shownUnverified = view.sections.flatMap((s) => s.unverified).length;
    assert.equal(view.fraction, `${shownBacked} of ${shownBacked + shownUnverified} backed`);
    assert.match(html, /1 of 4 backed/);
    assert.doesNotMatch(html, /\d{1,3}\s?%/);
  });

  it("prints the explainer once per group, not once per item", () => {
    const explainer = /These lines couldn&#x27;t be matched|These lines couldn't be matched/g;
    const hits = html.match(explainer) ?? [];
    const view = buildAnalysisView(messyRun());
    const groups = view.sections.filter((s) => s.unverified.length > 0).length;
    assert.equal(hits.length, groups, "one explainer per group that needs one");
    assert.ok(
      view.sections.flatMap((s) => s.unverified).length > groups,
      "and the fixture has more demoted items than groups",
    );
  });

  it("keeps the copy inside the kill list", () => {
    assert.doesNotMatch(html, /—/, "no em dashes");
  });
});

/* ------------------------------------------------------------------ */
/* 5. Mono speaker hygiene                                             */
/* ------------------------------------------------------------------ */

describe("a single stream never gets an invented speaker", () => {
  it("drops speaker display for a call the diarizer overshot", () => {
    assert.equal(shouldShowSpeakers(MONO), false);
    const html = render(messyRun());
    assert.doesNotMatch(html, /Speaker\s*\d/);
  });

  it("keeps real identities on a call that has them", () => {
    const stereo: TranscriptLine[] = [
      { id: "L1", index: 0, speaker: "Rep", text: "hello there how are you today" },
      { id: "L2", index: 1, speaker: "Prospect", text: "doing well thanks for asking" },
    ];
    assert.equal(shouldShowSpeakers(stereo), true);
    assert.equal(speakerDisplayName("Speaker 3"), null);
    assert.equal(speakerDisplayName("speaker_2"), null);
    assert.equal(speakerDisplayName("ch1"), null);
    assert.equal(speakerDisplayName("Rahul"), "Rahul");
  });

  it("suppresses labels on a call with one voice track and one label", () => {
    const single: TranscriptLine[] = [
      { id: "L1", index: 0, speaker: "Rep", text: "hello there how are you today" },
      { id: "L2", index: 1, speaker: "Rep", text: "doing well thanks for asking" },
    ];
    assert.equal(shouldShowSpeakers(single), false);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Render finesse                                                   */
/* ------------------------------------------------------------------ */

describe("what the page does with the data it already has", () => {
  it("groups action items by who carries them, with the spoken due date", () => {
    const steps: NoteView[] = [
      {
        key: "s1",
        text: "I will send the comparison on Thursday.",
        status: "verified",
        callSpecific: true,
        source: { lineId: "L4", quote: "i will send the comparison", timeLabel: "2:12", speaker: null },
      },
      {
        key: "s2",
        text: "The buyer will take the numbers to their team next week.",
        status: "verified",
        callSpecific: true,
        source: null,
      },
    ];
    const groups = groupStepsByOwner(steps);
    assert.deepEqual(
      groups.map((g) => g.ownerLabel),
      ["Your side", "The buyer"],
    );
    assert.equal(groups[0]!.steps[0]!.due, "Thursday");
    assert.equal(groups[0]!.steps[0]!.source?.timeLabel, "2:12");
    assert.equal(groups[1]!.steps[0]!.due, "next week");
    assert.equal(spokenDue("no date was agreed here"), null);
  });

  it("keeps a step nobody can point to out of the action items", () => {
    const view = buildAnalysisView(messyRun());
    const listed = view.ownerGroups.flatMap((g) => g.steps.map((s) => s.text));
    assert.ok(
      listed.every((text) => !text.includes("renewal is expensive")),
      "an action item is a commitment, so it needs a line behind it",
    );
    for (const group of view.ownerGroups) {
      for (const step of group.steps) {
        assert.ok(step.source, "every action item carries its citation");
      }
    }
  });

  it("puts topic chips under the title and a timestamp on every citation", () => {
    const html = render(messyRun());
    assert.ok(html.includes("Topics detected"));
    assert.ok(html.includes("Action items"));
    assert.match(html, /Hear it at \d+:\d\d/);
    assert.equal(callTimeLabel(41_000), "0:41");
    assert.equal(callTimeLabel(3_723_000), "1:02:03");
    assert.equal(callTimeLabel(undefined), null);
  });

  it("says the empty case once instead of seven times", () => {
    const empty = messyRun({
      status: "failed",
      notes: {
        ...messyRun().notes!,
        summary: [
          {
            id: "s0",
            text: "A need or evaluation driver came up on the call.",
            evidence: { lineId: "L2", quote: "we need to track phone calls and record them" },
            status: "verified",
          },
        ],
        intent: [],
        nextSteps: [],
        pricing: [],
      },
    });
    const view = buildAnalysisView(empty);
    assert.equal(view.noNotes, true, "every note was category text, so none render");
    assert.equal(view.fraction, null, "and a score over nothing is not a score");
    const text = renderedText(empty);
    const graveyard = text.match(/Nothing on this in the call\./g) ?? [];
    assert.equal(graveyard.length, 0, "no wall of repeated absence lines");
    assert.ok(text.includes("could be written up as a finding"));
    assert.ok(text.includes("Topics detected"), "the chips still carry the call");
  });

  it("says absence once, quietly, instead of striking through a fake finding", () => {
    const view = buildAnalysisView(messyRun());
    const objections = view.sections.find((s) => s.id === "objections")!;
    assert.equal(objections.hasContent, false);
    assert.equal(objections.absenceLine, "Nothing on this in the call.");
    const html = render(messyRun());
    const strikes = html.match(/line-through/g) ?? [];
    assert.equal(
      strikes.length,
      0,
      "strikethrough is reserved for text that is dangerous, and nothing here is",
    );
  });
});
