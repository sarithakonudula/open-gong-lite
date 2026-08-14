import { CoachClient } from "@/components/CoachClient";

export const metadata = { title: "Reps — OpenGong Lite" };

// Interim: renders the existing rep training loop inside the light shell
// until the Reps card re-skin lands.
export default function RepsPage() {
  return (
    <div className="legacy-dark min-h-svh">
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Reps
        </h1>
        <p className="mt-2 text-sm text-mist">
          Trait-level trends across every scored call, and drills built from
          the rep&rsquo;s own quoted lines — personalized with receipts.
        </p>
        <div className="mt-8">
          <CoachClient />
        </div>
      </div>
    </div>
  );
}
