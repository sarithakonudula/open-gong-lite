import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify429 } from "../src/lib/pyai";

describe("classify429", () => {
  it("retries short Retry-After", () => {
    const v = classify429("2");
    assert.equal(v.action, "retry");
    assert.ok((v.waitMs ?? 0) >= 2000);
  });

  it("treats missing or long Retry-After as daily cap", () => {
    assert.equal(classify429(null).action, "daily_cap");
    assert.equal(classify429("3600").action, "daily_cap");
  });
});
