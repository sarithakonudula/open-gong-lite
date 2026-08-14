import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { RunActionsBar } from "@/components/RunActionsBar";
import { RunWorkspace } from "@/components/RunWorkspace";
import { isAuthEnabled } from "@/lib/auth";
import { hasLlmConfigured } from "@/lib/settings";
import { demoSignalFeedForRun } from "@/lib/deal-signals";
import {
  demoScorecardForRun,
  listMethodologyPacks,
} from "@/lib/methodology";
import { listSamples } from "@/lib/samples";
import { getRun } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function RunPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const run = await getRun(id);
  if (!run) notFound();
  const showLogout = isAuthEnabled();
  const { tab } = await searchParams;
  const initialTab =
    tab === "scorecard" ? "scorecard" : tab === "signals" ? "signals" : "notes";

  const samples = await listSamples();
  const titleToSlug = Object.fromEntries(samples.map((s) => [s.title, s.slug]));
  const initialCard = demoScorecardForRun(run, titleToSlug);
  const signalFeed = demoSignalFeedForRun(run, titleToSlug);
  const packs = listMethodologyPacks().map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="min-h-screen">
      <div className="border-b border-white/10 px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            OpenGong Lite
          </Link>
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-mist">
              Deal intelligence · {run.id.slice(0, 8)}
            </p>
            {showLogout && (
              <LogoutButton className="btn-ghost !px-3 !py-1.5 text-sm" />
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <RunActionsBar runId={run.id} />
      </div>
      <RunWorkspace
        run={run}
        initialTab={initialTab}
        initialCard={initialCard}
        signalFeed={signalFeed}
        llmAvailable={hasLlmConfigured()}
        packs={packs}
      />
    </main>
  );
}
