import Link from "next/link";
import { listRuns } from "@/lib/store";
import { RUN_STATUS_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  const runs = await listRuns(100);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">
        Recordings
      </h1>

      {runs.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">No recordings yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Upload a call, paste a recording link, or run a sample — every
            analyzed call lands here.
          </p>
          <Link href="/" className="btn-primary mt-5 inline-flex text-sm">
            Go to Upload
          </Link>
        </div>
      ) : (
        <div className="card mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-edge text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-soft">
                <th className="px-5 py-3">Meeting name</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-edge last:border-b-0 hover:bg-canvas/60"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/runs/${run.id}`}
                      className="font-semibold text-fg hover:text-brand"
                    >
                      {run.title}
                    </Link>
                    <p className="mt-0.5 text-[13px] text-fg-muted">
                      {run.sourceLabel}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-fg-muted">{run.source}</td>
                  <td className="px-5 py-4 text-fg-muted">
                    {new Date(run.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`chip ${
                        run.status === "shipped"
                          ? "chip-positive"
                          : run.status === "partial"
                            ? "chip-warn"
                            : run.status === "failed"
                              ? "chip-risk"
                              : "chip-muted"
                      }`}
                    >
                      {RUN_STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
