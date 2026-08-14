import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySettingsPatch,
  AppSettingsSchema,
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
