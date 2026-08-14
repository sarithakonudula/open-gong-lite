// Runtime admin settings — the piece that makes LLM / HubSpot / Slack
// configurable from the UI instead of .env-and-restart. Stored as one JSON
// file under the data dir; secrets never leave the server unmasked.

import { promises as fs, readFileSync, statSync } from "fs";
import path from "path";
import { z } from "zod";
import { config } from "@/lib/config";

/** Sentinel the admin UI sends back for an untouched secret field. */
export const SECRET_MASK = "__unchanged__";

export const RiskFloorSchema = z.enum(["hot", "high", "watch"]);
export type RiskFloor = z.infer<typeof RiskFloorSchema>;

export const AppSettingsSchema = z.object({
  /** OpenAI-compatible endpoint. Admin values win over LLM_* env vars. */
  llmBaseUrl: z.string().trim().default(""),
  llmApiKey: z.string().trim().default(""),
  llmModel: z.string().trim().default(""),
  /** Appended to the extraction system prompt — never replaces the gate rules. */
  extractionGuidance: z.string().max(4000).default(""),
  /** Tone/structure guidance for the contextual follow-up email. */
  emailGuidance: z.string().max(4000).default(""),
  /** Guidance for the coaching narrative. */
  coachingGuidance: z.string().max(4000).default(""),
  /** HubSpot private-app token. Falls back to HUBSPOT_ACCESS_TOKEN. */
  hubspotToken: z.string().trim().default(""),
  /** Slack incoming-webhook URL for risk alerts + digest. */
  slackWebhookUrl: z.string().trim().default(""),
  /** Minimum alert severity that triggers a notification. */
  riskNotifyFloor: RiskFloorSchema.default("high"),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const SECRET_FIELDS = [
  "llmApiKey",
  "hubspotToken",
  "slackWebhookUrl",
] as const;

function settingsPath(): string {
  return path.join(config.dataDir, "settings.json");
}

let cache: { mtimeMs: number; value: AppSettings } | null = null;

/** Sync read with an mtime cache so hot paths never pay a parse. */
export function getSettings(): AppSettings {
  try {
    const stat = statSync(settingsPath());
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.value;
    const raw = readFileSync(settingsPath(), "utf8");
    const value = AppSettingsSchema.parse(JSON.parse(raw));
    cache = { mtimeMs: stat.mtimeMs, value };
    return value;
  } catch {
    return AppSettingsSchema.parse({});
  }
}

/** Pure merge: masked secrets keep their stored value; unknown keys dropped. */
export function applySettingsPatch(
  existing: AppSettings,
  patch: Record<string, unknown>,
): AppSettings {
  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(AppSettingsSchema.shape)) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    if (
      (SECRET_FIELDS as readonly string[]).includes(key) &&
      incoming === SECRET_MASK
    ) {
      continue;
    }
    merged[key] = incoming;
  }
  return AppSettingsSchema.parse(merged);
}

export type MaskedSettings = AppSettings & {
  hasLlm: boolean;
  hasHubspot: boolean;
  hasSlack: boolean;
};

/** What the admin UI sees — secrets replaced by the sentinel. */
export function maskSettings(s: AppSettings): MaskedSettings {
  return {
    ...s,
    llmApiKey: s.llmApiKey ? SECRET_MASK : "",
    hubspotToken: s.hubspotToken ? SECRET_MASK : "",
    slackWebhookUrl: s.slackWebhookUrl ? SECRET_MASK : "",
    hasLlm: resolveLlm(s) !== null,
    hasHubspot: resolveHubspotToken(s) !== null,
    hasSlack: resolveSlackWebhook(s) !== null,
  };
}

export async function saveSettings(
  patch: Record<string, unknown>,
): Promise<AppSettings> {
  const next = applySettingsPatch(getSettings(), patch);
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  cache = null;
  return next;
}

// ── Resolution: admin settings win, env is the fallback ─────────────────────

export type LlmTarget = {
  baseUrl: string;
  apiKey: string;
  model: string;
  source: "admin" | "env";
};

export function resolveLlm(s: AppSettings = getSettings()): LlmTarget | null {
  if (s.llmBaseUrl && s.llmApiKey) {
    return {
      baseUrl: s.llmBaseUrl.replace(/\/$/, ""),
      apiKey: s.llmApiKey,
      model: s.llmModel || config.llmModel,
      source: "admin",
    };
  }
  if (config.llmBaseUrl && config.llmApiKey) {
    return {
      baseUrl: config.llmBaseUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
      source: "env",
    };
  }
  return null;
}

export function hasLlmConfigured(): boolean {
  return resolveLlm() !== null;
}

export function resolveHubspotToken(
  s: AppSettings = getSettings(),
): string | null {
  return s.hubspotToken || process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
}

export function resolveSlackWebhook(
  s: AppSettings = getSettings(),
): string | null {
  return s.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL?.trim() || null;
}
