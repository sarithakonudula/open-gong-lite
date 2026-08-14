import { notFound } from "next/navigation";
import {
  RecordingTab,
  RecordingWorkspace,
} from "@/components/recording/RecordingWorkspace";
import { detectCallKind, KIND_DEFAULT_PACK, KIND_LABEL } from "@/lib/call-kind";
import {
  buildSampleCompanyIndex,
  companyForRun,
  normalizeCompanyKey,
} from "@/lib/company";
import { demoSignalFeedForRun } from "@/lib/deal-signals";
import { hasLlmAvailable } from "@/lib/llm";
import { listMethodologyPacks, scorecardForRun } from "@/lib/methodology";
import { sampleDatasetFeedForRun } from "@/lib/sample-data";
import { listSamples } from "@/lib/samples";
import { getRun } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function resolveTab(tab: string | undefined): RecordingTab {
  if (tab === "scorecard") return "scorecard";
  if (tab === "signals") return "signals";
  if (tab === "email") return "email";
  if (tab === "deal") return "deal";
  return "transcript";
}

export default async function RunPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const run = await getRun(id);
  if (!run) notFound();
  const { tab } = await searchParams;

  const samples = await listSamples();
  const index = buildSampleCompanyIndex(samples);
  const company = companyForRun(run, index);
  const callKind = detectCallKind(run.transcript);
  const initialCard = scorecardForRun(run, index.titleToSlug);
  const signalFeed =
    sampleDatasetFeedForRun(run) ?? demoSignalFeedForRun(run, index.titleToSlug);
  const packs = listMethodologyPacks().map((p) => ({ id: p.id, name: p.name }));
  const llmAvailable = await hasLlmAvailable();

  return (
    <RecordingWorkspace
      run={run}
      company={company}
      companyKey={normalizeCompanyKey(company)}
      initialTab={resolveTab(tab)}
      initialCard={initialCard}
      signalFeed={signalFeed}
      llmAvailable={llmAvailable}
      packs={packs}
      defaultPackId={KIND_DEFAULT_PACK[callKind.kind]}
      detectedKind={`${KIND_LABEL[callKind.kind]}${callKind.confidence === "low" ? " (default)" : ""}`}
    />
  );
}
