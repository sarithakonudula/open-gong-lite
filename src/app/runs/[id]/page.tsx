import Link from "next/link";
import { notFound } from "next/navigation";
import { DealNotesView } from "@/components/DealNotesView";
import { getRun } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

export default async function RunPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const run = await getRun(id);
  if (!run) notFound();

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
          <p className="text-xs uppercase tracking-[0.18em] text-mist">
            Deal intelligence · {run.id.slice(0, 8)}
          </p>
        </div>
      </div>
      <DealNotesView run={run} />
    </main>
  );
}
