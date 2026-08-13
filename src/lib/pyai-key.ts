import { promises as fs } from "fs";
import path from "path";
import { config, hasLivePyai, setRuntimePyaiKey } from "@/lib/config";

function keyFilePath(): string {
  return path.join(config.dataDir, ".pyai-sandbox-key.json");
}

type StoredKey = {
  apiKey: string;
  keyId?: string;
  orgId?: string;
  expiresAt?: number;
  baseUrl?: string;
  scopes?: string[];
  mintedAt: string;
};

export type KeyStatus = {
  configured: boolean;
  source: "env" | "sandbox-file" | "minted" | "none";
  preview: string | null;
  scopes: string[];
  expiresAt: number | null;
};

export function isSandboxKey(key: string): boolean {
  return key.startsWith("pyai_test_");
}

function previewKey(key: string): string {
  if (key.length <= 12) return "pyai_***";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

/** True when the active key came from auto-mint, not a user-supplied env var. */
export function canRemintSandbox(): boolean {
  return !hasLivePyai() && config.autoMintSandbox;
}

async function readStoredKey(): Promise<StoredKey | null> {
  try {
    const raw = await fs.readFile(keyFilePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredKey;
    if (!parsed.apiKey || typeof parsed.apiKey !== "string") return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStoredKey(stored: StoredKey): Promise<void> {
  const file = keyFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(stored, null, 2), "utf8");
}

async function mintSandboxKey(): Promise<StoredKey> {
  const response = await fetch(`${config.pyaiBaseUrl}/sandbox/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "OpenGong Lite" }),
  });

  if (!response.ok) {
    throw new Error(`Sandbox key mint failed (${response.status})`);
  }

  const data = (await response.json()) as {
    api_key: string;
    key_id?: string;
    org_id?: string;
    expires_at?: number;
    base_url?: string;
    scopes?: string[];
  };

  if (!data.api_key) {
    throw new Error("Sandbox mint response missing api_key");
  }

  const stored: StoredKey = {
    apiKey: data.api_key,
    keyId: data.key_id,
    orgId: data.org_id,
    expiresAt: data.expires_at,
    baseUrl: data.base_url,
    scopes: data.scopes,
    mintedAt: new Date().toISOString(),
  };

  await writeStoredKey(stored);
  return stored;
}

/** Resolve a PyAI key for server-side use. Never expose the raw key to clients. */
export async function ensurePyaiKey(): Promise<KeyStatus> {
  if (hasLivePyai() && config.pyaiApiKey) {
    return {
      configured: true,
      source: "env",
      preview: previewKey(config.pyaiApiKey),
      scopes: [],
      expiresAt: null,
    };
  }

  const stored = await readStoredKey();
  if (stored) {
    setRuntimePyaiKey(stored.apiKey);
    if (stored.baseUrl) {
      // keep config base unless explicitly different host was returned
    }
    return {
      configured: true,
      source: "sandbox-file",
      preview: previewKey(stored.apiKey),
      scopes: stored.scopes || [],
      expiresAt: stored.expiresAt ?? null,
    };
  }

  if (!config.autoMintSandbox) {
    return {
      configured: false,
      source: "none",
      preview: null,
      scopes: [],
      expiresAt: null,
    };
  }

  const minted = await mintSandboxKey();
  setRuntimePyaiKey(minted.apiKey);
  return {
    configured: true,
    source: "minted",
    preview: previewKey(minted.apiKey),
    scopes: minted.scopes || [],
    expiresAt: minted.expiresAt ?? null,
  };
}

/** Drop an expired/rejected sandbox key and mint a fresh one (L14). */
export async function remintSandboxKey(): Promise<KeyStatus> {
  if (!canRemintSandbox()) {
    throw new Error("Cannot remint: PYAI_API_KEY is set or auto-mint is off");
  }
  try {
    await fs.unlink(keyFilePath());
  } catch {
    // missing file is fine
  }
  const minted = await mintSandboxKey();
  setRuntimePyaiKey(minted.apiKey);
  return {
    configured: true,
    source: "minted",
    preview: previewKey(minted.apiKey),
    scopes: minted.scopes || [],
    expiresAt: minted.expiresAt ?? null,
  };
}

export async function getKeyStatus(): Promise<KeyStatus> {
  if (hasLivePyai() && config.pyaiApiKey) {
    return {
      configured: true,
      source: "env",
      preview: previewKey(config.pyaiApiKey),
      scopes: [],
      expiresAt: null,
    };
  }
  const stored = await readStoredKey();
  if (stored) {
    setRuntimePyaiKey(stored.apiKey);
    return {
      configured: true,
      source: "sandbox-file",
      preview: previewKey(stored.apiKey),
      scopes: stored.scopes || [],
      expiresAt: stored.expiresAt ?? null,
    };
  }
  return {
    configured: false,
    source: "none",
    preview: null,
    scopes: [],
    expiresAt: null,
  };
}
