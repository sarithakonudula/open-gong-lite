function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const config = {
  pyaiBaseUrl: (env("PYAI_BASE_URL") || "https://api.pyai.com/v1").replace(
    /\/$/,
    "",
  ),
  /** Mutated at runtime when a sandbox key is minted. */
  pyaiApiKey: env("PYAI_API_KEY"),
  hearModel: env("PYAI_HEAR_MODEL") || "pyai-hear",
  hearJobModel: env("PYAI_HEAR_JOB_MODEL") || "pyai-hear-telephony",
  recapPackId: env("PYAI_RECAP_PACK_ID") || "sales_outbound",
  /** Optional OpenAI-compatible fallback when Recap add-on is unavailable. */
  llmBaseUrl: env("LLM_BASE_URL")?.replace(/\/$/, ""),
  llmApiKey: env("LLM_API_KEY"),
  llmModel: env("LLM_MODEL") || "gpt-4o-mini",
  maxAttempts: Number(process.env.OPENGONG_MAX_ATTEMPTS || 3),
  deadlineMs: Number(process.env.OPENGONG_DEADLINE_MS || 180_000),
  maxTokensEstimate: Number(process.env.OPENGONG_MAX_TOKENS || 8_000),
  allowDemoWithoutKey: process.env.OPENGONG_DEMO_WITHOUT_KEY !== "false",
  autoMintSandbox: process.env.OPENGONG_AUTO_MINT_SANDBOX !== "false",
  diarizeDefault: process.env.OPENGONG_DIARIZE !== "false",
  channelDefault: process.env.OPENGONG_CHANNEL === "true",
};

export function hasLivePyai(): boolean {
  return Boolean(config.pyaiApiKey);
}

export function hasLlmFallback(): boolean {
  return Boolean(config.llmBaseUrl && config.llmApiKey);
}

export function setRuntimePyaiKey(key: string): void {
  config.pyaiApiKey = key;
}
