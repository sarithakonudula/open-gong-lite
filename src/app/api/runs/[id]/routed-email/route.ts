import { NextResponse } from "next/server";
import { validateDealNotes } from "@/lib/harness/gates";
import { getRun, saveRun } from "@/lib/store";
import {
  backedClaims,
  generateRoutedFollowUp,
  listTemplatesForUi,
  routeWithTrace,
  TEMPLATE_FILES,
  TemplateError,
} from "@/lib/template-email";
import type { RunNotes, RunRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** How long the routed draft gets before this request gives up. */
const ROUTED_DRAFT_TIMEOUT_MS = 20_000;

const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

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

type Loaded =
  | { ok: true; run: RunRecord; notes: RunNotes }
  | { ok: false; response: NextResponse };

async function loadGatedNotes(id: string): Promise<Loaded> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid run id" }, { status: 400 }),
    };
  }

  const run = await getRun(id);
  if (!run) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  if (!run.notes) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Run has no notes" }, { status: 400 }),
    };
  }

  // Runs stored before the checker recorded a per-note status carry no grade
  // at all. An ungraded note is not a backed one, so re-run the real gate
  // against this run's transcript rather than assuming anything.
  let notes = run.notes;
  if (anyClaimUngraded(notes) && run.transcript.length > 0) {
    const regated = validateDealNotes(notes, run.transcript);
    if (regated.ok) notes = { ...notes, ...regated.notes };
  }

  return { ok: true, run, notes };
}

/**
 * GET — template picker payload for this run: the library, which templates
 * fire on the backed claims, and the auto-match suggestion.
 */
export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const loaded = await loadGatedNotes(id);
  if (!loaded.ok) return loaded.response;

  const templates = listTemplatesForUi();
  const backed = backedClaims(loaded.notes);
  if (!backed.length) {
    return NextResponse.json({
      templates,
      suggestedId: null,
      matchingIds: [] as string[],
      backedCount: 0,
    });
  }

  const trace = routeWithTrace(loaded.notes, TEMPLATE_FILES);
  return NextResponse.json({
    templates,
    suggestedId: trace.template?.id ?? null,
    matchingIds: trace.considered.filter((c) => c.fired).map((c) => c.id),
    backedCount: backed.length,
  });
}

/**
 * POST — route this run's gated notes through the template library and store
 * the draft. Optional body `{ templateId }` forces a library template the
 * user picked; omit it to keep auto-match.
 */
export async function POST(request: Request, context: Ctx) {
  const { id } = await context.params;
  const loaded = await loadGatedNotes(id);
  if (!loaded.ok) return loaded.response;
  const { run, notes } = loaded;

  if (!backedClaims(notes).length) {
    return NextResponse.json(
      {
        error:
          "No note on this call is backed by a line in the transcript, so no template can be filled.",
      },
      { status: 400 },
    );
  }

  let templateId: string | undefined;
  const body = (await request.json().catch(() => null)) as {
    templateId?: unknown;
  } | null;
  if (body?.templateId != null && body.templateId !== "") {
    if (
      typeof body.templateId !== "string" ||
      !TEMPLATE_ID_RE.test(body.templateId)
    ) {
      return NextResponse.json(
        { error: "Invalid template id" },
        { status: 400 },
      );
    }
    templateId = body.templateId;
  }

  let routed;
  try {
    routed = await generateRoutedFollowUp(notes, {
      signal: AbortSignal.timeout(ROUTED_DRAFT_TIMEOUT_MS),
      templateId,
    });
  } catch (err) {
    if (err instanceof TemplateError && err.code === "TEMPLATE_NOT_FOUND") {
      return NextResponse.json(
        { error: "That template is not in the library." },
        { status: 404 },
      );
    }
    throw err;
  }

  if (!routed) {
    return NextResponse.json(
      {
        error: templateId
          ? "That template could not be filled from the backed notes on this call."
          : "No template in the library matches what this call carries, so nothing was drafted.",
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
