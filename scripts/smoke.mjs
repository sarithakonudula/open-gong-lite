import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = 3017;
const base = `http://127.0.0.1:${port}`;

// Prefer production server so we don't collide with an already-running `next dev`.
const child = spawn("npx", ["next", "start", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    OPENGONG_DEMO_WITHOUT_KEY: "true",
    OPENGONG_AUTO_MINT_SANDBOX: "false",
  },
});

let bootLog = "";
const onChunk = (buf) => {
  bootLog += buf.toString();
};
child.stdout.on("data", onChunk);
child.stderr.on("data", onChunk);

async function waitReady(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early:\n${bootLog.slice(-1000)}`);
    }
    try {
      const health = await fetch(`${base}/api/samples`);
      if (health.ok) return;
    } catch {
      // booting
    }
    await sleep(400);
  }
  throw new Error(`Server not ready:\n${bootLog.slice(-1000)}`);
}

try {
  await waitReady();
  const demo = await fetch(`${base}/api/demos/basecamp-fireflies`, {
    method: "POST",
  });
  const body = await demo.json();
  if (!demo.ok || !body.id) {
    throw new Error(body.error || "demo failed");
  }

  const runRes = await fetch(`${base}/api/runs/${body.id}`);
  const run = await runRes.json();
  if (run.status !== "shipped" || !run.notes) {
    throw new Error(`expected shipped notes, got ${run.status}`);
  }
  if (!run.notes.summary?.[0]?.evidence?.lineId) {
    throw new Error("missing receipt on summary");
  }

  const searchRes = await fetch(`${base}/api/runs?q=Fireflies`);
  const searchBody = await searchRes.json();
  if (!searchRes.ok || !Array.isArray(searchBody.runs)) {
    throw new Error("search runs failed");
  }
  if (!searchBody.runs.some((r) => r.id === run.id)) {
    throw new Error("expected Fireflies run in search results");
  }

  const liveRes = await fetch(`${base}/api/live/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sampleSlug: "basecamp-fireflies",
      title: "Smoke live finalize",
      transcript: run.transcript,
    }),
  });
  const liveBody = await liveRes.json();
  if (!liveRes.ok || !liveBody.id) {
    throw new Error(liveBody.error || "live finalize failed");
  }

  const liveRunRes = await fetch(`${base}/api/runs/${liveBody.id}`);
  const liveRun = await liveRunRes.json();
  if (liveRun.status !== "shipped" || liveRun.source !== "live") {
    throw new Error(
      `expected shipped live run, got ${liveRun.status}/${liveRun.source}`,
    );
  }

  const howRes = await fetch(`${base}/how`);
  if (!howRes.ok) throw new Error("how page failed");

  console.log("smoke ok", {
    id: run.id,
    status: run.status,
    claims: run.notes.summary.length,
    attempt: run.attempts?.[0]?.reason,
    searchHits: searchBody.runs.length,
    liveId: liveRun.id,
  });
  process.exitCode = 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}
