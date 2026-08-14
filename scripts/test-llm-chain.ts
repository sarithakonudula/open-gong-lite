import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatTextChain, LlmNotConfiguredError } from "../src/lib/llm";
import { detectLanguage } from "../src/lib/language";
import {
  buildLanguageOptions,
  FALLBACK_LANGUAGES,
  parseModelsResponse,
} from "../src/lib/pyai-options";
import {
  applySettingsPatch,
  AppSettingsSchema,
  isLanguageAllowed,
  maskSettings,
  preferredLanguage,
  resolveLlmChain,
  SECRET_MASK,
  type LlmTarget,
} from "../src/lib/settings";
import type { TranscriptLine } from "../src/lib/types";

const base = AppSettingsSchema.parse({});

function provider(
  id: string,
  enabled: boolean,
  overrides: Partial<{ baseUrl: string; apiKey: string; model: string; label: string }> = {},
) {
  return {
    id,
    label: overrides.label ?? id,
    baseUrl: overrides.baseUrl ?? `https://${id}.example/v1`,
    apiKey: overrides.apiKey ?? `sk-${id}`,
    model: overrides.model ?? `model-${id}`,
    enabled,
  };
}

describe("scoring LLM chain", () => {
  it("only checked, complete providers enter the chain, in list order", () => {
    const s = {
      ...base,
      llmProviders: [
        provider("groq", true),
        provider("off", false),
        provider("incomplete", true, { apiKey: "" }),
        provider("ollama", true),
      ],
      llmBaseUrl: "https://legacy.example/v1",
      llmApiKey: "sk-legacy",
      llmModel: "legacy-model",
    };
    const chain = resolveLlmChain(s);
    assert.deepEqual(
      chain.map((t) => t.label),
      ["groq", "ollama", "admin default"],
    );
    assert.equal(chain[0]!.source, "chain");
    assert.equal(chain[2]!.source, "admin");
  });

  it("masking hides provider keys; masked keys survive a save round-trip", () => {
    const s = { ...base, llmProviders: [provider("groq", true)] };
    const masked = maskSettings(s);
    assert.equal(masked.llmProviders[0]!.apiKey, SECRET_MASK);
    assert.ok(!JSON.stringify(masked).includes("sk-groq"));
    const merged = applySettingsPatch(s, {
      llmProviders: [{ ...masked.llmProviders[0]!, model: "new-model" }],
    });
    assert.equal(merged.llmProviders[0]!.apiKey, "sk-groq");
    assert.equal(merged.llmProviders[0]!.model, "new-model");
  });

  it("exfil guard per provider: new baseUrl with masked key clears the key", () => {
    const s = { ...base, llmProviders: [provider("groq", true)] };
    const masked = maskSettings(s);
    const merged = applySettingsPatch(s, {
      llmProviders: [
        { ...masked.llmProviders[0]!, baseUrl: "https://evil.example/v1" },
      ],
    });
    assert.equal(merged.llmProviders[0]!.apiKey, "");
    // Unknown provider id with a masked key also gets no secret.
    const ghost = applySettingsPatch(s, {
      llmProviders: [provider("new-id", true, { apiKey: SECRET_MASK })],
    });
    assert.equal(ghost.llmProviders[0]!.apiKey, "");
  });

  it("chatTextChain fails over to the next provider and reports which served", async () => {
    const chain: LlmTarget[] = [
      { baseUrl: "https://down.example/v1", apiKey: "k1", model: "m1", source: "chain", label: "down" },
      { baseUrl: "https://up.example/v1", apiKey: "k2", model: "m2", source: "chain", label: "up" },
    ];
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.startsWith("https://down")) {
        return { ok: false, status: 429, json: async () => ({}), text: async () => "rate limited" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
        text: async () => "",
      };
    };
    const result = await chatTextChain(
      { system: "s", user: "u" },
      { chain, fetchImpl },
    );
    assert.equal(result.text, '{"ok":true}');
    assert.equal(result.provider.label, "up");
    assert.equal(calls.length, 2);
  });

  it("empty chain throws LLM_NOT_CONFIGURED; all-fail throws the last error", async () => {
    await assert.rejects(
      chatTextChain({ system: "s", user: "u" }, { chain: [] }),
      (e: unknown) => e instanceof LlmNotConfiguredError,
    );
    const chain: LlmTarget[] = [
      { baseUrl: "https://a.example/v1", apiKey: "k", model: "m", source: "chain", label: "a" },
    ];
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    });
    await assert.rejects(
      chatTextChain({ system: "s", user: "u" }, { chain, fetchImpl }),
      /LLM call failed \(500\)/,
    );
  });
});

// ── Language filter ─────────────────────────────────────────────────────────

function lines(texts: string[]): TranscriptLine[] {
  return texts.map((text, i) => ({
    id: `L${i + 1}`,
    index: i,
    speaker: "S",
    text,
  }));
}

describe("language filter", () => {
  it("detects English and Spanish deterministically", () => {
    const en = detectLanguage(
      lines(["What was the problem you saw with the export?", "It was not working for the whole team and you said that this would be fixed."]),
    );
    assert.equal(en.code, "en");
    const es = detectLanguage(
      lines(["Pero usted dijo que los informes no funcionan para las oficinas.", "Sí, es un problema con más de una cuenta, como le dije."]),
    );
    assert.equal(es.code, "es");
  });

  it("empty transcript defaults to en at low confidence", () => {
    assert.deepEqual(detectLanguage([]), { code: "en", confidence: "low" });
  });

  it("filter off allows everything; on restricts to the allowed set", () => {
    assert.equal(isLanguageAllowed("es", base), true);
    const on = { ...base, languageFilterEnabled: true, allowedLanguages: ["en"] };
    assert.equal(isLanguageAllowed("en", on), true);
    assert.equal(isLanguageAllowed("es", on), false);
    assert.equal(isLanguageAllowed("en-US", on), true);
    assert.equal(preferredLanguage(on), "en");
  });

  it("pyai options: parses model languages, falls back to English-only", () => {
    const parsed = parseModelsResponse({
      data: [
        { id: "pyai-hear", languages: ["en", "es-419"] },
        { id: "pyai-recap" },
      ],
    });
    assert.deepEqual(parsed.hearModels, ["pyai-hear"]);
    assert.deepEqual(parsed.languages.sort(), ["en", "es"]);
    const options = buildLanguageOptions(parsed.languages);
    assert.ok(options.find((o) => o.code === "es")!.available);
    assert.ok(!options.find((o) => o.code === "fr")!.available);
    // Fallback is honest: only English is marked available.
    assert.deepEqual(
      FALLBACK_LANGUAGES.filter((o) => o.available).map((o) => o.code),
      ["en"],
    );
  });
});
