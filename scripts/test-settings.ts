import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySettingsPatch,
  AppSettingsSchema,
  decryptSecret,
  encryptSecret,
  maskSettings,
  resolveLlm,
  SECRET_MASK,
} from "../src/lib/settings";

const base = AppSettingsSchema.parse({});

describe("admin settings", () => {
  it("defaults parse clean", () => {
    assert.equal(base.riskNotifyFloor, "high");
    assert.equal(base.llmApiKey, "");
  });

  it("masked secrets keep their stored value on save", () => {
    const stored = { ...base, llmApiKey: "sk-real", hubspotToken: "pat-real" };
    const next = applySettingsPatch(stored, {
      llmApiKey: SECRET_MASK,
      hubspotToken: SECRET_MASK,
      llmModel: "llama-3.3-70b-versatile",
    });
    assert.equal(next.llmApiKey, "sk-real");
    assert.equal(next.hubspotToken, "pat-real");
    assert.equal(next.llmModel, "llama-3.3-70b-versatile");
  });

  it("a real new secret replaces the stored one", () => {
    const stored = { ...base, llmApiKey: "sk-old" };
    const next = applySettingsPatch(stored, { llmApiKey: "sk-new" });
    assert.equal(next.llmApiKey, "sk-new");
  });

  it("unknown keys are dropped, invalid enums rejected", () => {
    const next = applySettingsPatch(base, { evil: "x", llmModel: "m" });
    assert.ok(!("evil" in next));
    assert.throws(() => applySettingsPatch(base, { riskNotifyFloor: "nuclear" }));
  });

  it("masking never leaks a secret", () => {
    const masked = maskSettings({ ...base, llmApiKey: "sk-real", slackWebhookUrl: "https://hooks.slack.com/x" });
    assert.equal(masked.llmApiKey, SECRET_MASK);
    assert.equal(masked.slackWebhookUrl, SECRET_MASK);
    assert.ok(!JSON.stringify(masked).includes("sk-real"));
  });

  it("changing the LLM base URL clears a kept key (exfiltration guard)", () => {
    const stored = { ...base, llmBaseUrl: "https://good.example/v1", llmApiKey: "sk-real" };
    const repointed = applySettingsPatch(stored, {
      llmBaseUrl: "https://evil.example/v1",
      llmApiKey: SECRET_MASK,
    });
    assert.equal(repointed.llmApiKey, "");
    // Supplying a fresh key alongside the new URL is fine.
    const legit = applySettingsPatch(stored, {
      llmBaseUrl: "https://other.example/v1",
      llmApiKey: "sk-new",
    });
    assert.equal(legit.llmApiKey, "sk-new");
    // Same URL keeps the key.
    const same = applySettingsPatch(stored, { llmModel: "m", llmApiKey: SECRET_MASK });
    assert.equal(same.llmApiKey, "sk-real");
  });

  it("secrets encrypt at rest and roundtrip", () => {
    const blob = encryptSecret("sk-super-secret", "session-secret");
    assert.match(blob, /^enc:v1:/);
    assert.ok(!blob.includes("sk-super-secret"));
    assert.equal(decryptSecret(blob, "session-secret"), "sk-super-secret");
  });

  it("wrong secret or garbage decrypts to empty, never throws", () => {
    const blob = encryptSecret("sk-x", "secret-a");
    assert.equal(decryptSecret(blob, "secret-b"), "");
    assert.equal(decryptSecret("enc:v1:not-base64!!", "secret-a"), "");
    assert.equal(decryptSecret("", "secret-a"), "");
    // Legacy plaintext passes through so pre-encryption files keep working.
    assert.equal(decryptSecret("sk-legacy", "secret-a"), "sk-legacy");
  });

  it("admin LLM settings win over env fallback", () => {
    const target = resolveLlm({
      ...base,
      llmBaseUrl: "https://api.groq.com/openai/v1/",
      llmApiKey: "gsk_x",
      llmModel: "llama-3.3-70b-versatile",
    });
    assert.ok(target);
    assert.equal(target!.source, "admin");
    assert.equal(target!.baseUrl, "https://api.groq.com/openai/v1");
  });
});
