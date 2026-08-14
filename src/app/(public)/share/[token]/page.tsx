import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordingWorkspace } from "@/components/recording/RecordingWorkspace";
import { ElectronLogo } from "@/components/shell/ElectronLogo";
import { buildSampleCompanyIndex, companyForRun } from "@/lib/company";
import { config } from "@/lib/config";
import { listSamples } from "@/lib/samples";
import { getRunByShareToken, isShareExpired } from "@/lib/store";

type Props = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  if (!/^[a-f0-9]{16,64}$/i.test(token)) notFound();

  const run = await getRunByShareToken(token);
  if (!run || (run.status !== "shipped" && run.status !== "partial")) {
    notFound();
  }
  if (isShareExpired(run.createdAt, config.shareTtlDays)) notFound();

  const samples = await listSamples();
  const index = buildSampleCompanyIndex(samples);

  return (
    <main className="min-h-svh bg-canvas">
      <div className="border-b border-edge bg-surface px-6 py-3.5 md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/">
            <ElectronLogo markClassName="h-7 w-7" textClassName="text-[16px]" />
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-soft">
            Shared deal notes
          </p>
        </div>
      </div>
      <RecordingWorkspace
        run={run}
        company={companyForRun(run, index)}
        initialTab="transcript"
        initialCard={null}
        signalFeed={null}
        llmAvailable={false}
        packs={[]}
        shareMode
      />
    </main>
  );
}
