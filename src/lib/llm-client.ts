/**
 * The one OpenAI-compatible chat call in the codebase.
 *
 * Extraction (src/lib/llm-extract.ts) and the routed follow-up draft
 * (src/lib/template-email.ts) both go through here, so there is a single place
 * where a base URL is trimmed, a key is attached, a non-200 becomes a readable
 * error, and an empty completion is caught. Nothing here is provider shaped:
 * any endpoint that speaks /chat/completions works, which is what lets the
 * local Ollama tier reuse it unchanged.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  messages: ChatMessage[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  jsonObject?: boolean;
  /** Provenance label the caller owns, never guessed here. */
  source?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type ChatResult = {
  text: string;
  model: string;
  baseUrl: string;
  source: string;
};

export class LlmError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = code;
    this.code = code;
    this.status = status;
  }
}

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const baseUrl = String(opts.baseUrl ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new LlmError("LLM_NOT_CONFIGURED", "no chat endpoint is configured");
  }
  if (!opts.apiKey) {
    throw new LlmError("LLM_KEY_MISSING", "no API key for the chat endpoint");
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0,
    messages: opts.messages,
  };
  if (opts.jsonObject !== false) body.response_format = { type: "json_object" };

  const res = await doFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LlmError(
      "LLM_HTTP_ERROR",
      `chat/completions returned ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new LlmError("LLM_EMPTY_RESPONSE", "the model returned no content");
  }

  return {
    text,
    model: data.model || String(opts.model ?? ""),
    baseUrl,
    source: opts.source ?? "configured",
  };
}
