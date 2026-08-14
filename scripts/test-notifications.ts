import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_NOTIFICATIONS } from "../src/lib/fixtures/notifications";
import { deriveNotifications } from "../src/lib/notifications";
import type { RecordingRow } from "../src/lib/recording-row";

function row(overrides: Partial<RecordingRow> = {}): RecordingRow {
  return {
    id: "r1",
    title: "Pricing & Next Steps",
    company: "Globex Inc",
    createdAt: "2026-08-14T10:00:00.000Z",
    durationMs: 92000,
    pullQuote: "If the pricing works, we'd love to move next month.",
    topics: ["pricing"],
    score: 74,
    scoreSource: "momentum",
    callType: "Sales",
    dealState: "Positive",
    sentimentPct: 74,
    status: "shipped",
    source: "upload",
    sourceLabel: "call.mp3",
    callKind: "sales",
    isSample: false,
    ...overrides,
  };
}

describe("deriveNotifications", () => {
  it("is deterministic — same inputs, same ids", () => {
    const a = deriveNotifications([row()], []);
    const b = deriveNotifications([row()], []);
    assert.deepEqual(a, b);
    assert.ok(a.some((n) => n.id === "processed:r1"));
  });

  it("every processed run produces a processed event with a link", () => {
    const items = deriveNotifications([row()], []);
    const processed = items.find((n) => n.id === "processed:r1");
    assert.ok(processed);
    assert.equal(processed?.kind, "processed");
    assert.equal(processed?.href, "/runs/r1");
    assert.ok(processed?.detail.includes("74%"));
  });

  it("risk events fire only for At Risk rows", () => {
    const risky = deriveNotifications(
      [row({ id: "r2", dealState: "At Risk" })],
      [],
    );
    assert.ok(risky.some((n) => n.id === "risk:r2"));

    const neutral = deriveNotifications(
      [row({ id: "r3", dealState: "Neutral" })],
      [],
    );
    assert.ok(!neutral.some((n) => n.kind === "risk"));
    assert.ok(!neutral.some((n) => n.kind === "positive"));
  });

  it("high scores need the 85 floor and use the latest call", () => {
    const items = deriveNotifications(
      [],
      [
        {
          rep: "Maya",
          calls: [
            { score: 90, at: "2026-08-10T10:00:00.000Z", runId: "a" },
            { score: 88, at: "2026-08-12T10:00:00.000Z", runId: "b" },
          ],
        },
        {
          rep: "Sam",
          calls: [{ score: 60, at: "2026-08-13T10:00:00.000Z", runId: "c" }],
        },
      ],
    );
    assert.ok(items.some((n) => n.id === "highscore:Maya:b"));
    assert.ok(!items.some((n) => n.id.startsWith("highscore:Sam")));
  });

  it("sorts newest first", () => {
    const items = deriveNotifications(
      [
        row({ id: "old", createdAt: "2026-08-01T10:00:00.000Z" }),
        row({ id: "new", createdAt: "2026-08-14T10:00:00.000Z" }),
      ],
      [],
    );
    assert.equal(items[0].at, "2026-08-14T10:00:00.000Z");
    assert.equal(items[items.length - 1].at, "2026-08-01T10:00:00.000Z");
  });
});

describe("fixture notifications", () => {
  it("are all labeled sample with fixed dates", () => {
    for (const item of FIXTURE_NOTIFICATIONS) {
      assert.equal(item.sample, true);
      assert.ok(!Number.isNaN(Date.parse(item.at)));
    }
  });
});
