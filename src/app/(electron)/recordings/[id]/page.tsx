import { notFound } from "next/navigation";
import {
  RecordingDetail,
  RecordingDetailClient,
} from "@/components/electron/RecordingDetailClient";
import {
  formatTimestamp,
  toRecordingRow,
} from "@/lib/recordings-view";
import { listSamples } from "@/lib/samples";
import { getRun } from "@/lib/store";
import { isEmailableStatus } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export default async function RecordingDetailPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await getRun(id);
  if (!run || !run.notes) notFound();

  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));
  const slugToCompany = Object.fromEntries(samples.map((s) => [s.slug, s.company]));
  const row = toRecordingRow(run, (r) => {
    const slug =
      r.sampleSlug || (r.source === "sample" ? titleToSlug[r.sourceLabel] : undefined);
    return (slug && slugToCompany[slug]) || r.crm?.company || r.sourceLabel;
  });

  const lineById = new Map(run.transcript.map((l) => [l.id, l]));
  const notes = run.notes;
  const verified = (claims: typeof notes.summary) =>
    claims.filter((c) => isEmailableStatus(c.status));

  // Summary items carry real receipts: timestamp when the line has one,
  // the line id otherwise. Both click through to the moment.
  const summary = [...verified(notes.summary), ...verified(notes.intent)]
    .slice(0, 4)
    .map((c) => {
      const line = lineById.get(c.evidence.lineId);
      return {
        text: c.text,
        lineId: c.evidence.lineId,
        timestamp: formatTimestamp(line?.startMs, c.evidence.lineId),
        startMs: line?.startMs ?? null,
      };
    });

  const highlighted = new Set(
    [...verified(notes.summary), ...verified(notes.intent), ...verified(notes.nextSteps)].map(
      (c) => c.evidence.lineId,
    ),
  );

  const detail: RecordingDetail = {
    id: run.id,
    title: row.title,
    company: row.company,
    date: run.createdAt,
    durationLabel: row.durationLabel,
    dealState: row.dealState,
    score: row.score,
    scoreBasis: row.scoreBasis,
    hasAudio: Boolean(run.audioContentType),
    transcript: run.transcript.map((l) => ({
      id: l.id,
      speaker: l.speaker,
      text: l.text,
      startMs: l.startMs,
      highlight: highlighted.has(l.id),
    })),
    summary,
    topics: [...row.tags, ...verified(notes.competitors ?? []).map(() => "competitor")]
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .slice(0, 6),
    email: notes.followUpEmail
      ? { subject: notes.followUpEmail.subject, body: notes.followUpEmail.body }
      : null,
  };

  return <RecordingDetailClient detail={detail} />;
}
