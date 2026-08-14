// Shared OpenAI-compatible chat layer for everything that scores or drafts.
//
// The admin's checked providers form a CHAIN (settings.resolveLlmChain):
// the first is primary, the rest are failover. chatText walks the chain —
// a provider that errors or returns nothing is skipped and the next one is
// tried, so a rate-limited primary doesn't take scoring down with it.

import { resolveLlmChain, type LlmTarget } from "@/lib/settings";

/**
 * An endpoint the caller resolved itself, used instead of resolveLlm().
 *
 * The one caller is the routed follow-up email's tier ladder, which can end up
 * on a keyless local Ollama that resolveLlm() cannot describe: nothing is in
 * admin settings and nothing is in the env, the endpoint was found by probing
 * loopback. Overriding the target keeps that tier on this single chat call
 * instead of growing a second one beside it. `source` is free-form so a caller
 * can label its own provenance ("ollama-local") without teaching settings.ts
 * about tiers it does not own.
 */
export type ChatTarget = Omit<LlmTarget, "source"> & { source?: string };

export type ChatArgs = {
  system: string;
  user: string;
  temperature?: number;
  /** Explicit endpoint. Omit to use the configured one (admin, then env). */
  target?: ChatTarget;
  signal?: AbortSignal;
};
export type ChatFn = (args: ChatArgs) => Promise<string>;
export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM is not configured — set it on /admin or via LLM_* env vars");
    this.name = "LLM_NOT_CONFIGURED";
  }
}

async function callOne(
  target: Pick<LlmTarget, "baseUrl" | "apiKey" | "model">,
  { system, user, temperature = 0.2, signal }: ChatArgs,
  fetchImpl: FetchLike,
): Promise<string> {
  const response = await fetchImpl(`${target.baseUrl}/chat/completions`, {

    method: "POST",
    headers: {
      Authorization: `Bearer ${target.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: target.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `LLM call failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  return content;
}

/**
 * Walk the chain until one provider answers. Throws LlmNotConfiguredError on
 * an empty chain, otherwise the LAST provider's error when all fail.
 */
export async function chatTextChain(
  args: ChatArgs,
  opts: { chain?: LlmTarget[]; fetchImpl?: FetchLike } = {},
): Promise<{ text: string; provider: LlmTarget }> {
  const chain = opts.chain ?? resolveLlmChain();
  if (chain.length === 0) throw new LlmNotConfiguredError();
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  let lastError: unknown = null;
  for (const target of chain) {
    try {
      return { text: await callOne(target, args, fetchImpl), provider: target };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All LLM providers in the chain failed");
}

/**
 * Chain-backed chat returning just the assistant text. A caller-resolved
 * target (the detected local Ollama tier, which the settings chain cannot
 * describe) bypasses the chain and calls that one endpoint directly.
 */
export const chatText: ChatFn = async (args) => {
  if (args.target) {
    return callOne(args.target, args, fetch as unknown as FetchLike);
  }
  return (await chatTextChain(args)).text;
};

/** Strip accidental code fences before JSON.parse. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

export async function chatJson(args: ChatArgs, chat: ChatFn = chatText): Promise<unknown> {
  return parseJsonLoose(await chat(args));
}
