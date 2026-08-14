/**
 * Native Ollama auto-detection: one short loopback probe, zero dependencies.
 *
 * The draft tier ladder (owned by src/lib/template-email.ts) is: a configured
 * key wins outright and this file is never even called; only when there is no
 * LLM_API_KEY do we ask localhost once, on a short clock, and any answer short
 * of a clean tag list falls straight through to the keyless path exactly as if
 * Ollama did not exist. detectOllama() never throws and never leaves a caller
 * waiting past its timeout: no server, a refused connection, a slow reply, an
 * empty install, or a malformed response all resolve the same way, to null,
 * meaning "nothing here".
 */

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 500;

/**
 * Preference order for which installed model drafts the email when more than
 * one is pulled. Small local models are uneven at following the citation
 * rules, so this is a bias toward the families that have behaved best in
 * practice. It is not a claim that any of them matches a hosted model.
 */
const MODEL_PREFERENCE = [/^llama3\.1\b/i, /^llama3\.2\b/i, /^qwen/i, /^mistral/i];

export type OllamaTier = {
  baseUrl: string;
  model: string;
  source: "ollama-local";
};

type TagPayload = { models?: Array<{ name?: string; model?: string }> };

export type DetectOptions = {
  env?: Record<string, string | undefined>;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function tagNames(payload: unknown): string[] {
  const models = (payload as TagPayload | null)?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => String(m?.name ?? m?.model ?? "").trim())
    .filter(Boolean);
}

/**
 * Given the tag names Ollama reports installed, which one drafts the email.
 * First preference-list match wins; with no match, the first installed tag;
 * with nothing installed, null.
 */
export function pickModel(names: string[]): string | null {
  for (const pattern of MODEL_PREFERENCE) {
    const hit = names.find((n) => pattern.test(n));
    if (hit) return hit;
  }
  return names[0] ?? null;
}

/**
 * Honor LLM_MODEL only when that tag (or its family) is actually installed.
 * A hosted default left in .env (e.g. gpt-4o-mini) must not win over a real
 * local pull — otherwise the probe "succeeds" and every chat call 404s.
 */
export function resolveInstalledModel(
  names: string[],
  preferred?: string | null,
): string | null {
  const wanted = preferred?.trim();
  if (wanted) {
    const lower = wanted.toLowerCase();
    const hit = names.find((name) => {
      const n = name.toLowerCase();
      return (
        n === lower ||
        n.startsWith(`${lower}:`) ||
        lower.startsWith(`${n.split(":")[0]}:`)
      );
    });
    if (hit) return hit;
  }
  return pickModel(names);
}

/**
 * One GET against Ollama's own tag list, one short timeout, and a promise that
 * never rejects. Every failure mode (no server on that port, refused
 * connection, timeout, non-200, unparseable body, an install with zero models)
 * resolves to null, and callers read null as "not here, use the next tier".
 *
 * fetchImpl and timeoutMs exist for the tests: a real probe necessarily makes a
 * real loopback call, and nothing under scripts/ should need Ollama installed.
 */
export async function detectOllama(
  opts: DetectOptions = {},
): Promise<OllamaTier | null> {
  const env = opts.env ?? process.env;
  const baseUrl = String(opts.baseUrl ?? OLLAMA_BASE_URL).replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return null;
  const timeoutMs = Number.isFinite(opts.timeoutMs)
    ? Number(opts.timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    if (!res || !res.ok) return null;
    const payload = await res.json();
    const names = tagNames(payload);
    const model = resolveInstalledModel(names, env.LLM_MODEL);
    if (!model) return null;
    return { baseUrl: `${baseUrl}/v1`, model, source: "ollama-local" };
  } catch {
    // No server, refused connection, aborted on timeout, bad JSON: all quiet.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
