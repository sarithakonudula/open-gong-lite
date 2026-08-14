import Link from "next/link";
import { DealSignalsView } from "@/components/DealSignalsView";
import {
  buildSampleCall,
  SAMPLE_CALLS,
  sampleSignalFeedFor,
} from "@/lib/sample-data";

export const dynamic = "force-static";

const SHOWCASE_SLUGS = [
  "pickle-rick-discovery",
  "gigglepixel-qbr",
  "sloth-speed-export",
] as const;

export default function SignalsPage() {
  const feeds = SHOWCASE_SLUGS.map((slug) => {
    const spec = SAMPLE_CALLS.find((s) => s.slug === slug);
    if (!spec) return null;
    const { transcript } = buildSampleCall(spec);
    return sampleSignalFeedFor(spec, transcript);
  }).filter((feed): feed is NonNullable<typeof feed> => feed != null);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-atmosphere" />
      <div className="signal-bar absolute left-0 right-0 top-0 h-px" />

      <div className="relative mx-auto w-full max-w-4xl px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-soft">
              Coaching
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">
              Deal signals
            </h1>
          </div>
          <Link href="/how" className="btn-ghost">
            How it works
          </Link>
        </div>

        <p className="mt-5 text-lg leading-relaxed text-fg-muted">
          Page visits, support tickets, renewal dates, and promises nobody
          kept, turned into things worth doing today. Each one carries the line
          from the call that makes it matter, or says plainly that no line
          backs it. Sample data from Pickle Rick Robotics, Gigglepixel Games,
          and Sloth Speed Internet — load dummy data on Upload to browse the
          full 24-company set.
        </p>

        {feeds.length > 0 ? (
          <div className="mt-8 space-y-10">
            {feeds.map((feed) => (
              <DealSignalsView key={feed.company} feed={feed} />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-fg-soft">Demo sample unavailable.</p>
        )}
      </div>
    </main>
  );
}
