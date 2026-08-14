/**
 * The fallback inversion, run through the real loop.
 *
 * On the live call the summarizer wrote a correct reading of the call whose
 * quote could not be recovered from messy speech-to-text, the gate demoted it,
 * and the keyword extractor then ran last and won the page with template lines
 * whose quotes trivially exist. These two runs keep that order the right way
 * round: the keyword pass never overwrites a reading a model produced, and a
 * failed run-level verdict never blanks the notes.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { RunRecord, TranscriptLine } from "../src/lib/types";

// The store writes run JSON under config.dataDir, which is read when the
// config module first loads. Point it somewhere disposable before that, and
// pull the modules under test in only once it is set.
const dataDir = mkdtempSync(path.join(tmpdir(), "opengong-loop-"));
process.env.OPENGONG_DATA_DIR = dataDir;
process.env.OPENGONG_MAX_ATTEMPTS = "3";

async function harness() {
  const [loop, settings, view] = await Promise.all([
    import("../src/lib/harness/loop"),
    import("../src/lib/settings"),
    import("../src/lib/analysis-view"),
  ]);
  return {
    runDealNotesLoop: loop.runDealNotesLoop,
    hasLlmConfigured: settings.hasLlmConfigured,
    isCategoryNote: view.isCategoryNote,
  };
}

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const T: TranscriptLine[] = [
  {
    id: "L1",
    index: 0,
    speaker: "Rep",
    text: "thanks for making the time today i want to hear what you are running now",
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
    speaker: "Prospect",
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

/**
 * A summarizer that read the call correctly and paraphrased while doing it.
 * Nothing here is quotable word for word, which is exactly the case that used
 * to lose the page to the keyword extractor.
 */
const recap = {
  call_id: "c1",
  status: "complete" as const,
  headline: "Discovery call about call tracking and texting",
  record: {
    summary:
      "The customer is looking for a solution to track phone calls, record options, and send texts for their sales team.",
    next_steps: ["Send a comparison document before Thursday"],
    intent: ["The customer is evaluating a replacement for their current vendor"],
  },
};

function allNotes(run: RunRecord) {
  const n = run.notes!;
  return [
    ...n.summary,
    ...n.objections,
    ...n.intent,
    ...n.nextSteps,
    ...(n.pain ?? []),
    ...(n.pricing ?? []),
    ...(n.competitors ?? []),
  ];
}

describe("the keyword pass never overwrites a model's reading of the call", () => {
  it("keeps the demoted summarizer notes and never falls to template lines", async (t) => {
    const { runDealNotesLoop, hasLlmConfigured, isCategoryNote } =
      await harness();
    if (hasLlmConfigured()) {
      t.skip("a configured model would take the retry, so this case cannot run here");
      return;
    }
    const run = await runDealNotesLoop({
      source: "upload",
      sourceLabel: "brianne-call.mp3",
      transcript: T,
      titleHint: "Brianne discovery call",
      recap,
    });

    assert.ok(run.notes, "a failed verdict must not blank the notes");
    assert.equal(
      run.notes!.notesSource,
      "model",
      "the reading that survives is the one a model wrote",
    );
    const texts = allNotes(run).map((c) => c.text);
    assert.ok(
      texts.some((t2) => t2.includes("track phone calls")),
      `the model's reading has to survive its demotion: ${JSON.stringify(texts)}`,
    );
    assert.ok(
      texts.every((t2) => !isCategoryNote(t2)),
      `keyword template lines must never replace it: ${JSON.stringify(texts)}`,
    );
    assert.ok(
      !run.notes!.title.includes("keyword extractor"),
      "and the keyword extractor's title must not reach the run either",
    );
  });

  it("still lets the keyword pass read a call when nothing else can", async () => {
    const { runDealNotesLoop } = await harness();
    const run = await runDealNotesLoop({
      source: "live",
      sourceLabel: "live capture",
      transcript: T,
      titleHint: "Live capture",
      forceDemoExtract: true,
    });
    assert.ok(run.notes, "the deterministic reader still produces notes");
    assert.equal(run.notes!.notesSource, "keyword");
  });
});
