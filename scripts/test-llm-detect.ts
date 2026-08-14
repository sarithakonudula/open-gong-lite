/**
 * Native Ollama auto-detection, all offline. Every case injects its own fetch
 * (or none at all), so nothing here touches a real socket and none of it needs
 * Ollama installed or running.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectOllama, pickModel } from "../src/lib/llm-detect";

type FetchLike = typeof fetch;

const tags = (names: string[]) =>
  (async () => ({
    ok: true,
    json: async () => ({ models: names.map((name) => ({ name })) }),
  })) as unknown as FetchLike;

describe("pickModel", () => {
  it("prefers the family list in order over an arbitrary tag", () => {
    assert.equal(pickModel(["gemma2:9b", "llama3.1:8b", "mistral:7b"]), "llama3.1:8b");
    assert.equal(pickModel(["gemma2:9b", "llama3.2:3b", "mistral:7b"]), "llama3.2:3b");
    assert.equal(pickModel(["gemma2:9b", "qwen2.5:7b"]), "qwen2.5:7b");
    assert.equal(pickModel(["gemma2:9b", "mistral:7b"]), "mistral:7b");
  });

  it("prefers llama3.1 over llama3.2 when both are installed", () => {
    assert.equal(pickModel(["llama3.2:3b", "llama3.1:8b"]), "llama3.1:8b");
  });

  it("falls back to the first installed tag when nothing on the list matches", () => {
    assert.equal(pickModel(["gemma2:9b", "phi3:14b"]), "gemma2:9b");
  });

  it("returns null on an empty install", () => {
    assert.equal(pickModel([]), null);
  });
});

describe("detectOllama", () => {
  it("returns the OpenAI-compatible base URL, a picked model, and its source", async () => {
    let seen = "";
    const fetchImpl = (async (url: string) => {
      seen = url;
      return { ok: true, json: async () => ({ models: [{ name: "llama3.2:3b" }] }) };
    }) as unknown as FetchLike;
    const out = await detectOllama({ fetchImpl, env: {} });
    assert.equal(seen, "http://127.0.0.1:11434/api/tags");
    assert.deepEqual(out, {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.2:3b",
      source: "ollama-local",
    });
  });

  it("lets LLM_MODEL override the auto-pick only when that tag is installed", async () => {
    const out = await detectOllama({
      fetchImpl: tags(["llama3.2:3b", "mistral:7b"]),
      env: { LLM_MODEL: "mistral:7b" },
    });
    assert.equal(out?.model, "mistral:7b");
  });

  it("ignores a hosted LLM_MODEL that is not installed locally", async () => {
    const out = await detectOllama({
      fetchImpl: tags(["llama3.2:3b", "mistral:7b"]),
      env: { LLM_MODEL: "gpt-4o-mini" },
    });
    assert.equal(out?.model, "llama3.2:3b");
  });

  it("trims a trailing slash on a custom base URL", async () => {
    let seen = "";
    const fetchImpl = (async (url: string) => {
      seen = url;
      return { ok: true, json: async () => ({ models: [{ name: "llama3.1:8b" }] }) };
    }) as unknown as FetchLike;
    const out = await detectOllama({
      fetchImpl,
      env: {},
      baseUrl: "http://127.0.0.1:11434/",
    });
    assert.equal(seen, "http://127.0.0.1:11434/api/tags");
    assert.equal(out?.baseUrl, "http://127.0.0.1:11434/v1");
  });

  it("degrades to null on a refused connection, never throws", async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), {
        code: "ECONNREFUSED",
      });
    }) as unknown as FetchLike;
    await assert.doesNotReject(async () => {
      assert.equal(await detectOllama({ fetchImpl, env: {} }), null);
    });
  });

  it("degrades to null on a non-200, on bad JSON, on a shape with no models, and on an empty install", async () => {
    const cases: FetchLike[] = [
      (async () => ({ ok: false, status: 500 })) as unknown as FetchLike,
      (async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      })) as unknown as FetchLike,
      (async () => ({ ok: true, json: async () => ({ unexpected: true }) })) as unknown as FetchLike,
      tags([]),
    ];
    for (const fetchImpl of cases) {
      assert.equal(await detectOllama({ fetchImpl, env: {} }), null);
    }
  });

  it("aborts a slow reply at the timeout instead of hanging the caller", async () => {
    const fetchImpl = ((_url: string, init: { signal?: AbortSignal } = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      })) as unknown as FetchLike;
    const started = Date.now();
    const out = await detectOllama({ fetchImpl, env: {}, timeoutMs: 20 });
    assert.equal(out, null);
    assert.ok(
      Date.now() - started < 500,
      "the probe must not slow the caller past its own timeout",
    );
  });
});
