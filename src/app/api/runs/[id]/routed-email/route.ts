import { NextResponse } from "next/server";
import { validateDealNotes } from "@/lib/harness/gates";
import { getRun, saveRun } from "@/lib/store";
import { backedClaims, generateRoutedFollowUp } from "@/lib/template-email";
import type { RunNotes } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** How long the routed draft gets before this request gives up. */
const ROUTED_DRAFT_TIMEOUT_MS = 20_000;

function anyClaimUngraded(notes: RunNotes): boolean {
  return [
    ...notes.summary,
    ...notes.objections,
    ...notes.intent,
    ...notes.nextSteps,
    ...(notes.pain ?? []),
    ...(notes.pricing ?? []),
    ...(notes.competitors ?? []),
  ].some((claim) => claim.status == null);
}

/**
 * POST — route this run's gated notes through the template library and store
 * the draft. Runs on demand so a run analyzed before the routed variant
 * existed can get one without being re-analyzed.
 *
 * The library only ever sees claims the gate passed, and the draft goes back
 * through the same screen the baseline email goes through.
 */
export async function POST(_request: Request, context: Ctx) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!run.notes) {
    return NextResponse.json({ error: "Run has no notes" }, { status: 400 });
  }

  // Runs stored before the checker recorded a per-note status carry no grade
  // at all. An ungraded note is not a backed one, so re-run the real gate
  // against this run's transcript rather than assuming anything.
  let notes = run.notes;
  if (anyClaimUngraded(notes) && run.transcript.length > 0) {
    const regated = validateDealNotes(notes, run.transcript);
    if (regated.ok) notes = { ...notes, ...regated.notes };
  }

  if (!backedClaims(notes).length) {
    return NextResponse.json(
      {
        error:
          "No note on this call is backed by a line in the transcript, so no template can be filled.",
      },
      { status: 400 },
    );
  }

  const routed = await generateRoutedFollowUp(notes, {
    signal: AbortSignal.timeout(ROUTED_DRAFT_TIMEOUT_MS),
  });
  if (!routed) {
    return NextResponse.json(
      {
        error:
          "No template in the library matches what this call carries, so nothing was drafted.",
      },
      { status: 422 },
    );
  }

  await saveRun({
    ...run,
    notes: { ...notes, routedFollowUp: routed },
  });

  return NextResponse.json({
    subject: routed.subject,
    body: routed.body,
    template: routed.template,
    provenance: routed.provenance,
  });
}
