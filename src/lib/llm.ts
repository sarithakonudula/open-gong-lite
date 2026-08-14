// Shared OpenAI-compatible chat helper for the action-layer modules.
// Existing extraction/methodology code keeps its own fetch (patched to
// resolveLlm); new modules go through chatJson so gates stay in one place.

import { resolveLlm, type LlmTarget } from "@/lib/settings";

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

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM is not configured — set it on /admin or via LLM_* env vars");
    this.name = "LLM_NOT_CONFIGURED";
  }
}

/** Raw chat completion returning the assistant text. */
export const chatText: ChatFn = async ({
  system,
  user,
  temperature = 0.2,
  target,
  signal,
}) => {
  const llm = target ?? resolveLlm();
  if (!llm || !llm.baseUrl || !llm.apiKey) throw new LlmNotConfiguredError();
  const response = await fetch(`${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llm.model,
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
    throw new Error(`LLM call failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  return content;
};

/** Strip accidental code fences before JSON.parse. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

export async function chatJson(args: ChatArgs, chat: ChatFn = chatText): Promise<unknown> {
  return parseJsonLoose(await chat(args));
}
