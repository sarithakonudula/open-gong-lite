import { RecordingsClient } from "@/components/recordings/RecordingsClient";
import { buildRowContext, toRecordingRow } from "@/lib/recording-row";
import { listSamples } from "@/lib/samples";
import { listFullRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  const [runs, samples] = await Promise.all([listFullRuns(200), listSamples()]);
  const index = buildRowContext(samples);
  const rows = runs.map((run) => toRecordingRow(run, index));
  return <RecordingsClient rows={rows} />;
}
