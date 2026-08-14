// Runtime admin settings — the piece that makes LLM / HubSpot / Slack
// configurable from the UI instead of .env-and-restart. Stored as one JSON
// file under the data dir; secrets never leave the server unmasked.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
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

// ── Secrets at rest: AES-256-GCM keyed off OPENGONG_SESSION_SECRET ─────────
// Set a real OPENGONG_SESSION_SECRET in production — the dev fallback only
// obfuscates. Losing/rotating the secret invalidates stored secrets (they
// read back as empty and must be re-entered on /admin), never crashes.

const ENC_PREFIX = "enc:v1:";

function encryptionSecret(): string {
  return (
    process.env.OPENGONG_SESSION_SECRET?.trim() ||
    "opengong-dev-session-secret"
  );
}

function derivedKey(secret: string): Buffer {
  return createHash("sha256").update(`${secret}:settings-v1`).digest();
}

export function encryptSecret(
  plain: string,
  secret: string = encryptionSecret(),
): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    ENC_PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")
  );
}

/** Returns "" when the blob is malformed or the secret changed. */
export function decryptSecret(
  blob: string,
  secret: string = encryptionSecret(),
): string {
  if (!blob) return "";
  if (!blob.startsWith(ENC_PREFIX)) return blob; // legacy plaintext
  try {
    const raw = Buffer.from(blob.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return "";
  }
}

function decryptSecretFields(s: AppSettings): AppSettings {
  const out = { ...s };
  for (const field of SECRET_FIELDS) {
    out[field] = decryptSecret(out[field]);
  }
  return out;
}

function encryptSecretFields(s: AppSettings): AppSettings {
  const out = { ...s };
  for (const field of SECRET_FIELDS) {
    out[field] = encryptSecret(out[field]);
  }
  return out;
}

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
    const value = decryptSecretFields(
      AppSettingsSchema.parse(JSON.parse(raw)),
    );
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
  const next = AppSettingsSchema.parse(merged);
  // Exfiltration guard: repointing the LLM endpoint without supplying a new
  // key clears the stored one, so a stored key can never be replayed against
  // an attacker-chosen host.
  if (
    next.llmBaseUrl !== existing.llmBaseUrl &&
    (patch.llmApiKey === undefined || patch.llmApiKey === SECRET_MASK)
  ) {
    next.llmApiKey = "";
  }
  return next;
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
  await fs.writeFile(
    settingsPath(),
    JSON.stringify(encryptSecretFields(next), null, 2),
    "utf8",
  );
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
