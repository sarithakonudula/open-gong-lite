import { DigestClient } from "@/components/DigestClient";

export const metadata = { title: "Companies — OpenGong Lite" };

// Interim: renders the existing management digest (per-company momentum,
// risks, next steps) inside the light shell until the Companies re-skin lands.
export default function CompaniesPage() {
  return (
    <div className="legacy-dark min-h-svh">
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Companies
        </h1>
        <p className="mt-2 text-sm text-mist">
          Every company&rsquo;s call cluster — momentum, risks, and next steps
          per deal, built only from gate-passed claims.
        </p>
        <div className="mt-8">
          <DigestClient />
        </div>
      </div>
    </div>
  );
}
