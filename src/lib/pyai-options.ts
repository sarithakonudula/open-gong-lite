// What PyAI actually offers — models and transcription languages — for the
// admin page. Queried live from the PyAI API when a key is configured;
// falls back to the documented reality (English-only transcription today)
// so the UI never invents capability the provider doesn't have.

import { config } from "@/lib/config";

export type LanguageOption = {
  code: string;
  label: string;
  /** Only available languages are selectable in the filter. */
  available: boolean;
};

export type PyaiOptions = {
  /** Hear/transcription model ids PyAI reports. */
  hearModels: string[];
  languages: LanguageOption[];
  source: "pyai" | "fallback";
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  hi: "Hindi",
};

/** Documented provider constraint: English-only transcription today. */
export const FALLBACK_LANGUAGES: LanguageOption[] = Object.entries(
  LANGUAGE_LABELS,
).map(([code, label]) => ({ code, label, available: code === "en" }));

function labelFor(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

/** Normalize whatever shape the models endpoint returns into ids + languages. */
export function parseModelsResponse(raw: unknown): {
  hearModels: string[];
  languages: string[];
} {
  const data = (raw as { data?: unknown[]; models?: unknown[] }) ?? {};
  const items = (Array.isArray(data.data) ? data.data : data.models) ?? [];
  const hearModels: string[] = [];
  const languages = new Set<string>();
  for (const item of items) {
    const m = item as { id?: unknown; languages?: unknown };
    const id = typeof m.id === "string" ? m.id : "";
    if (id.includes("hear")) {
      hearModels.push(id);
      if (Array.isArray(m.languages)) {
        for (const lang of m.languages) {
          if (typeof lang === "string" && /^[a-z]{2}/.test(lang)) {
            languages.add(lang.slice(0, 2));
          }
        }
      }
    }
  }
  return { hearModels, languages: [...languages] };
}

export function buildLanguageOptions(available: string[]): LanguageOption[] {
  const set = new Set(available.length > 0 ? available : ["en"]);
  const known = Object.keys(LANGUAGE_LABELS).map((code) => ({
    code,
    label: labelFor(code),
    available: set.has(code),
  }));
  // Anything PyAI reports beyond our label table still shows up.
  for (const code of set) {
    if (!LANGUAGE_LABELS[code]) {
      known.push({ code, label: labelFor(code), available: true });
    }
  }
  return known;
}

export async function fetchPyaiOptions(): Promise<PyaiOptions> {
  if (!config.pyaiApiKey) {
    return {
      hearModels: [config.hearModel, config.hearJobModel],
      languages: FALLBACK_LANGUAGES,
      source: "fallback",
    };
  }
  try {
    const response = await fetch(`${config.pyaiBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.pyaiApiKey}` },
    });
    if (!response.ok) throw new Error(`models endpoint ${response.status}`);
    const parsed = parseModelsResponse(await response.json());
    return {
      hearModels:
        parsed.hearModels.length > 0
          ? parsed.hearModels
          : [config.hearModel, config.hearJobModel],
      languages: buildLanguageOptions(parsed.languages),
      source: "pyai",
    };
  } catch {
    return {
      hearModels: [config.hearModel, config.hearJobModel],
      languages: FALLBACK_LANGUAGES,
      source: "fallback",
    };
  }
}
