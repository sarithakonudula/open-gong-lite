import { randomUUID } from "crypto";
import { config } from "@/lib/config";
import { demoExtractDealNotes } from "@/lib/demo-extract";
import { hasLlmAvailable } from "@/lib/llm";
import {
  coverageToRunStatus,
  validateDealNotes,
} from "@/lib/harness/gates";
import { shouldDiscardRepair } from "@/lib/harness/repair";
import { extractDealNotesWithLlm } from "@/lib/llm-extract";
import type { RecapCall } from "@/lib/pyai";
import { mapRecapToDealNotes } from "@/lib/recap-map";
import { newShareToken, saveRun } from "@/lib/store";
import {
  backedClaims,
  generateRoutedFollowUp,
} from "@/lib/template-email";
import {
  AttemptRecord,
  DealNotes,
  NotesSource,
  RunNotes,
  RunRecord,
  TranscriptLine,
} from "@/lib/types";

/** How long the routed draft gets before the run ships without it. */
const ROUTED_DRAFT_TIMEOUT_MS = 20_000;

/**
 * The second email variant, attempted only after the gate has finalized the
 * first one. Three things make this safe to bolt on:
 *
 * 1. It reads the gated notes, so it only ever sees claims the gate passed.
 * 2. Its draft goes back through the same screen the baseline goes through.
 * 3. When no model tier is available, a deterministic template fill still
 *    ships so the routed panel is not blank; LLM polish is additive.
 */
async function withRoutedFollowUp(notes: RunNotes): Promise<RunNotes> {
  // Nothing was backed, so nothing left the page. A second variant of an
  // email that was withheld would be the one way back in.
  if (!backedClaims(notes).length) return notes;
  try {
    const routed = await generateRoutedFollowUp(notes, {
      signal: AbortSignal.timeout(ROUTED_DRAFT_TIMEOUT_MS),
    });
    return routed ? { ...notes, routedFollowUp: routed } : notes;
  } catch {
    return notes;
  }
}

export type AnalyzeInput = {
  source: "upload" | "url" | "sample" | "live";
  sourceLabel: string;
  /** Customer/company for deal clustering — from the upload form or CRM. */
  company?: string;
  /** Sample slug when source is sample — attaches a stored methodology verdict. */
  sampleSlug?: string;
  transcript: TranscriptLine[];
  titleHint?: string;
  forceDemoExtract?: boolean;
  curatedNotes?: DealNotes | null;
  recap?: RecapCall | null;
  pyaiCallId?: string;
};

function deadlinePassed(startedAt: number, deadlineMs: number): boolean {
  return Date.now() - startedAt >= deadlineMs;
}

type Candidate = { raw: unknown; reason: string; source: NotesSource };

/**
 * Pick the next producer to try.
 *
 * `heldModelNotes` says the run already holds gate-checked notes a summarizer
 * or language model wrote. When it does, the keyword extractor is no longer a
 * candidate: its template lines pass the quote check trivially, so letting it
 * run last means the emptiest reading of the call wins the page. That is the
 * inversion this loop used to have. The keyword pass still contributes, as
 * topic chips the screen builds from the transcript, and never as notes.
 *
 * Returns null when nothing is left that could improve on what is held.
 */
async function produceCandidate(
  input: AnalyzeInput,
  attempt: number,
  lastFailures: string,
  heldModelNotes: boolean,
): Promise<Candidate | null> {
  if (input.curatedNotes && attempt === 1) {
    return {
      raw: input.curatedNotes,
      reason: "sample_curated_notes",
      source: "curated",
    };
  }

  if (input.forceDemoExtract) {
    if (heldModelNotes) return null;
    return {
      raw: demoExtractDealNotes(
        input.transcript,
        input.titleHint || input.sourceLabel,
      ),
      reason: "demo_extract",
      source: "keyword",
    };
  }

  // Prefer PyAI Recap on first attempts when available.
  if (input.recap?.status === "complete" && attempt === 1) {
    return {
      raw: mapRecapToDealNotes(
        input.recap,
        input.transcript,
        input.titleHint || input.sourceLabel,
      ),
      reason: "pyai_recap",
      source: "model",
    };
  }

  if (await hasLlmAvailable()) {
    return {
      raw: await extractDealNotesWithLlm(
        input.transcript,
        lastFailures || undefined,
      ),
      reason: "llm_fallback",
      source: "model",
    };
  }

  // Deterministic local extract keeps demos shipping when Recap/LLM are unavailable.
  if (heldModelNotes) return null;
  return {
    raw: demoExtractDealNotes(
      input.transcript,
      input.titleHint || input.sourceLabel,
    ),
    reason: input.recap ? "demo_after_recap_map_retry" : "demo_extract",
    source: "keyword",
  };
}

export async function runDealNotesLoop(
  input: AnalyzeInput,
): Promise<RunRecord> {
  const startedAt = Date.now();
  const id = randomUUID();

  let run: RunRecord = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    source: input.source,
    sourceLabel: input.sourceLabel,
    ...(input.company ? { company: input.company } : {}),
    ...(input.sampleSlug ? { sampleSlug: input.sampleSlug } : {}),
    shareToken: newShareToken(),
    transcript: input.transcript,
    notes: null,
    attempts: [],
    error: null,
    budget: {
      maxAttempts: config.maxAttempts,
      maxTokensEstimate: config.maxTokensEstimate,
      deadlineMs: config.deadlineMs,
    },
  };

  run = await saveRun(run);

  let lastFailures = "";
  let shippedNotes: RunNotes | null = null;
  // The best reading of the call the run has produced so far, kept whatever
  // the run-level verdict says about it. A demoted note is still a note.
  let heldNotes: RunNotes | null = null;
  let heldStatus: RunRecord["status"] = "failed";

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    if (deadlinePassed(startedAt, config.deadlineMs)) {
      const record: AttemptRecord = {
        attempt,
        at: new Date().toISOString(),
        ok: false,
        reason: "deadline_exceeded",
        failures: [
          {
            code: "deadline",
            message: `Exceeded ${config.deadlineMs}ms budget`,
          },
        ],
      };
      run = await saveRun({
        ...run,
        status: "failed",
        attempts: [...run.attempts, record],
        error:
          "This call took longer than the time budget allows, so the loop stopped.",
      });
      return run;
    }

    try {
      const heldModelNotes =
        heldNotes != null && heldNotes.notesSource !== "keyword";
      const candidate = await produceCandidate(
        input,
        attempt,
        lastFailures,
        heldModelNotes,
      );

      // Nothing left to try that could beat what is already held. Stop here
      // rather than spend a try on a pass that would only overwrite it.
      if (!candidate) break;

      const { raw, reason, source } = candidate;

      // A repair that answers with placeholder text instead of a copied line
      // is discarded, and the demoted original stays. This is the exact move
      // the live run got wrong: three placeholder repairs in a row, then a
      // keyword pass that shipped empty notes as fully backed.
      // Only a model can be asked to copy a line, so only a model's answer
      // can be a failed repair. The keyword pass writes its own sentinel and
      // is judged by the gate like any other candidate.
      if (
        source === "model" &&
        shouldDiscardRepair({
          attempt,
          holdingNotes: heldNotes != null,
          raw,
        })
      ) {
        const record: AttemptRecord = {
          attempt,
          at: new Date().toISOString(),
          ok: false,
          reason: "repair_placeholder_discarded",
          failures: [
            {
              code: "repair_placeholder",
              message:
                "The repair wrote a stand-in where a copied line belongs, so it was thrown away and the earlier notes kept.",
            },
          ],
        };
        run = await saveRun({
          ...run,
          attempts: [...run.attempts, record],
        });
        continue;
      }

      const gate = validateDealNotes(raw, input.transcript);

      if (!gate.ok) {
        lastFailures = gate.failures
          .map((f) => `${f.code}${f.path ? ` @ ${f.path}` : ""}: ${f.message}`)
          .join("\n");
        const record: AttemptRecord = {
          attempt,
          at: new Date().toISOString(),
          ok: false,
          reason: "gate_blocked",
          failures: gate.failures,
        };
        run = await saveRun({
          ...run,
          attempts: [...run.attempts, record],
        });
        continue;
      }

      const graded: RunNotes = { ...gate.notes, notesSource: source };
      const coverage = graded.coverage;
      const runStatus = coverage
        ? coverageToRunStatus(coverage)
        : "shipped";
      const demotions = [
        ...graded.summary,
        ...graded.objections,
        ...graded.intent,
        ...graded.nextSteps,
        ...(graded.pain || []),
        ...(graded.pricing || []),
        ...(graded.competitors || []),
      ].filter(
        (c) =>
          c.status === "uncorroborated" || c.status === "blocked_injection",
      );

      // Hold the first reading of the call, and let a later pass take its
      // place only when that pass actually shipped. A repair that fails is
      // not an improvement on what it was repairing.
      if (!heldNotes || runStatus !== "failed") {
        heldNotes = graded;
        heldStatus = runStatus;
      }

      if (runStatus === "failed" && attempt < config.maxAttempts) {
        lastFailures = demotions
          .map(
            (c) =>
              `The note "${c.text}" was sent back because this quote is not in the call: "${c.evidence.quote}"`,
          )
          .join("\n");
        const record: AttemptRecord = {
          attempt,
          at: new Date().toISOString(),
          ok: false,
          reason: "gate_unproven",
          failures: demotions.map((c) => ({
            code: c.status || "uncorroborated",
            message: c.evidence.quote,
            path: c.id,
          })),
        };
        run = await saveRun({
          ...run,
          notes: heldNotes,
          attempts: [...run.attempts, record],
        });
        continue;
      }

      shippedNotes =
        runStatus === "failed"
          ? (heldNotes ?? graded)
          : await withRoutedFollowUp(graded);
      const record: AttemptRecord = {
        attempt,
        at: new Date().toISOString(),
        ok: runStatus !== "failed",
        reason:
          runStatus === "failed"
            ? "gate_unproven"
            : coverage?.band === "SHIPPED_WITH_CORRECTIONS"
              ? `${reason}+corrections`
              : reason,
        failures: demotions.map((c) => ({
          code: c.status || "uncorroborated",
          message: c.evidence.quote,
          path: c.id,
        })),
      };
      run = await saveRun({
        ...run,
        status: runStatus,
        notes: shippedNotes,
        attempts: [...run.attempts, record],
        error:
          runStatus === "failed"
            ? "Some of these notes could not be matched to a line in the call. They stay on this page, marked, and the follow-up email is held back."
            : null,
      });
      return run;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown extraction error";
      lastFailures = message;
      const record: AttemptRecord = {
        attempt,
        at: new Date().toISOString(),
        ok: false,
        reason: "extract_error",
        failures: [{ code: "extract_error", message }],
      };
      run = await saveRun({
        ...run,
        attempts: [...run.attempts, record],
        error: message,
      });
    }
  }

  // Whatever the run-level verdict is, the notes the run did produce stay on
  // the page. The verdict decides whether an email leaves, not whether a
  // reader gets to see what was found.
  const finalNotes = shippedNotes ?? heldNotes;
  run = await saveRun({
    ...run,
    status: shippedNotes ? "partial" : finalNotes ? heldStatus : "failed",
    notes: finalNotes,
    error: finalNotes
      ? (run.error ??
        "Some of these notes could not be matched to a line in the call. They stay on this page, marked, and the follow-up email is held back.")
      : (run.error ||
        "Nothing came back from this call that could be checked against the transcript."),
  });
  return run;
}
