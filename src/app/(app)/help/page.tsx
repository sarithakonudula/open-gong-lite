import Link from "next/link";

export const metadata = { title: "Help — OpenGong Lite" };

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Help</h1>
      <div className="card mt-8 px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-fg">
          Help center in progress
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          Until it lands, the citation-checking explainer covers the core of
          how OpenGong Lite works.
        </p>
        <Link href="/how" className="btn-primary mt-5 inline-flex text-sm">
          How the checking works
        </Link>
      </div>
    </div>
  );
}
