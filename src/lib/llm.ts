// Shared OpenAI-compatible chat helper for the action-layer modules.
// Existing extraction/methodology code keeps its own fetch (patched to
// resolveLlm); new modules go through chatJson so gates stay in one place.

import { resolveLlm } from "@/lib/settings";

export type ChatArgs = { system: string; user: string; temperature?: number };
export type ChatFn = (args: ChatArgs) => Promise<string>;

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM is not configured — set it on /admin or via LLM_* env vars");
    this.name = "LLM_NOT_CONFIGURED";
  }
}

/** Raw chat completion returning the assistant text. */
export const chatText: ChatFn = async ({ system, user, temperature = 0.2 }) => {
  const llm = resolveLlm();
  if (!llm) throw new LlmNotConfiguredError();
  const response = await fetch(`${llm.baseUrl}/chat/completions`, {
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
