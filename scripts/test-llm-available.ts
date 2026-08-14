/**
 * resolveAvailableLlm / hasLlmAvailable — configured keys win; otherwise one
 * short Ollama probe. All offline via injected detect.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasLlmAvailable,
  resolveAvailableLlm,
} from "../src/lib/llm";

describe("resolveAvailableLlm", () => {
  it("falls to local Ollama when no keys are configured", async () => {
    const out = await resolveAvailableLlm({
      configured: null,
      detect: async () => ({
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.2:3b",
        source: "ollama-local",
      }),
    });
    assert.ok(out);
    assert.equal(out!.source, "ollama-local");
    assert.equal(out!.model, "llama3.2:3b");
    assert.equal(out!.apiKey, "ollama");
  });

  it("returns null when neither keys nor Ollama are present", async () => {
    assert.equal(
      await resolveAvailableLlm({ configured: null, detect: async () => null }),
      null,
    );
    assert.equal(
      await hasLlmAvailable({ configured: null, detect: async () => null }),
      false,
    );
  });

  it("lets a configured key win without probing Ollama", async () => {
    let probed = false;
    const out = await resolveAvailableLlm({
      configured: {
        baseUrl: "https://api.example/v1",
        apiKey: "k",
        model: "gpt-4o-mini",
        label: "env",
        source: "env",
      },
      detect: async () => {
        probed = true;
        return {
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "llama3.2:3b",
          source: "ollama-local",
        };
      },
    });
    assert.equal(out?.source, "env");
    assert.equal(probed, false);
  });
});
