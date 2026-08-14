import { randomUUID } from "crypto";
import { config, hasLlmFallback } from "@/lib/config";
import { demoExtractDealNotes } from "@/lib/demo-extract";
import {
  coverageToRunStatus,
  validateDealNotes,
} from "@/lib/harness/gates";
import { extractDealNotesWithLlm } from "@/lib/llm-extract";
import type { RecapCall } from "@/lib/pyai";
import { mapRecapToDealNotes } from "@/lib/recap-map";
import { newShareToken, saveRun } from "@/lib/store";
import {
  AttemptRecord,
  DealNotes,
  RunRecord,
  TranscriptLine,
} from "@/lib/types";

export type AnalyzeInput = {
  source: "upload" | "url" | "sample" | "live";
  sourceLabel: string;
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

async function produceCandidate(
  input: AnalyzeInput,
  attempt: number,
  lastFailures: string,
): Promise<{ raw: unknown; reason: string }> {
  if (input.curatedNotes && attempt === 1) {
    return {
      raw: input.curatedNotes,
      reason: "sample_curated_notes",
    };
  }

  if (input.forceDemoExtract) {
    return {
      raw: demoExtractDealNotes(
        input.transcript,
        input.titleHint || input.sourceLabel,
      ),
      reason: "demo_extract",
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
    };
  }

  if (hasLlmFallback()) {
    return {
      raw: await extractDealNotesWithLlm(
        input.transcript,
        lastFailures || undefined,
      ),
      reason: "llm_fallback",
    };
  }

  // Deterministic local extract keeps demos shipping when Recap/LLM are unavailable.
  return {
    raw: demoExtractDealNotes(
      input.transcript,
      input.titleHint || input.sourceLabel,
    ),
    reason: input.recap ? "demo_after_recap_map_retry" : "demo_extract",
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
  let shippedNotes: DealNotes | null = null;

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
      const { raw, reason } = await produceCandidate(
        input,
        attempt,
        lastFailures,
      );
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

      const coverage = gate.notes.coverage;
      const runStatus = coverage
        ? coverageToRunStatus(coverage)
        : "shipped";
      const demotions = [
        ...gate.notes.summary,
        ...gate.notes.objections,
        ...gate.notes.intent,
        ...gate.notes.nextSteps,
        ...(gate.notes.pain || []),
        ...(gate.notes.pricing || []),
        ...(gate.notes.competitors || []),
      ].filter(
        (c) =>
          c.status === "uncorroborated" || c.status === "blocked_injection",
      );

      if (runStatus === "failed" && attempt < config.maxAttempts) {
        lastFailures = demotions
          .map(
            (c) =>
              `${c.status} @ ${c.id || c.evidence.lineId}: ${c.evidence.quote}`,
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
          notes: gate.notes,
          attempts: [...run.attempts, record],
        });
        continue;
      }

      shippedNotes = gate.notes;
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
            ? "Nothing here could be backed by a line in the call. The notes stay on this page, marked."
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

  run = await saveRun({
    ...run,
    status: shippedNotes ? "partial" : "failed",
    notes: shippedNotes,
    error:
      run.error ||
      "The notes never came back in a form that could be checked. What each try did is listed below.",
  });
  return run;
}
