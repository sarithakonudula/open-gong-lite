import Link from "next/link";

export const metadata = { title: "Settings — OpenGong Lite" };

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Settings</h1>
      <div className="card mt-8 px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-fg">
          Workspace settings arriving here
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          LLM providers, HubSpot, and Slack are configured in the admin console
          for now.
        </p>
        <Link href="/admin" className="btn-primary mt-5 inline-flex text-sm">
          Open admin console
        </Link>
      </div>
    </div>
  );
}
