import Link from "next/link";
import { notFound } from "next/navigation";
import { DealNotesView } from "@/components/DealNotesView";
import { getRunByShareToken } from "@/lib/store";

type Props = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  if (!/^[a-f0-9]{16,64}$/i.test(token)) notFound();

  const run = await getRunByShareToken(token);
  if (!run || (run.status !== "shipped" && run.status !== "partial")) {
    notFound();
  }

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
            Shared deal notes
          </p>
        </div>
      </div>
      <DealNotesView run={run} shareMode />
    </main>
  );
}
