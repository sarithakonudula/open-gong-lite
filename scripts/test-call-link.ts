import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractMediaUrlFromHtml,
  isSafeHttpsUrl,
  parseCallLink,
  resolveCallLink,
  titleFromSlug,
} from "../src/lib/call-link";

describe("call-link parsing", () => {
  it("fathom share link", () => {
    const p = parseCallLink(
      "https://fathom.video/share/bCQM_PAL9sbFHGxkpPTvHkKAiTsrMnGQ",
    )!;
    assert.equal(p.provider, "fathom");
    assert.equal(p.id, "bCQM_PAL9sbFHGxkpPTvHkKAiTsrMnGQ");
    assert.equal(p.directUrl, null);
  });

  it("google drive FOLDER is classified, never resolved to media", () => {
    const p = parseCallLink(
      "https://drive.google.com/drive/folders/1J8p83eHToOsssBmrX385r9QYEN0e8k3r",
    )!;
    assert.equal(p.provider, "gdrive_folder");
    assert.equal(p.id, "1J8p83eHToOsssBmrX385r9QYEN0e8k3r");
    assert.equal(p.directUrl, null);
  });

  it("google drive FILE normalizes to a direct download URL", () => {
    const p = parseCallLink(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing",
    )!;
    assert.equal(p.provider, "gdrive_file");
    assert.equal(
      p.directUrl,
      "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp",
    );
  });

  it("fireflies view link: names stripped from the slug into a title", () => {
    const p = parseCallLink(
      "https://app.fireflies.ai/view/GrowthX-AI-Deepan-SaaS-Labs-::01KTWE0E8PDEV1EMC9ATA190E9",
    )!;
    assert.equal(p.provider, "fireflies");
    assert.equal(p.id, "01KTWE0E8PDEV1EMC9ATA190E9");
    assert.equal(p.title, "GrowthX AI Deepan SaaS Labs");
  });

  it("loom, zoom, gong classify with ids", () => {
    assert.equal(parseCallLink("https://www.loom.com/share/abc123def456")!.provider, "loom");
    assert.equal(
      parseCallLink("https://us02web.zoom.us/rec/share/xYz-123.abc")!.provider,
      "zoom",
    );
    assert.equal(
      parseCallLink("https://app.gong.io/call?id=1234567890")!.provider,
      "gong",
    );
  });

  it("direct media URLs pass straight through, with a title from the filename", () => {
    const p = parseCallLink("https://cdn.example.com/calls/acme-discovery-call.mp3")!;
    assert.equal(p.provider, "direct");
    assert.equal(p.directUrl, "https://cdn.example.com/calls/acme-discovery-call.mp3");
    assert.equal(p.title, "acme discovery call");
  });

  it("SSRF shapes are rejected outright", () => {
    for (const bad of [
      "http://example.com/call.mp3",
      "https://localhost/call.mp3",
      "https://192.168.1.5/call.mp3",
      "https://169.254.169.254/latest/meta-data",
      "https://user:pass@example.com/call.mp3",
      "not a url",
    ]) {
      assert.equal(parseCallLink(bad), null, bad);
    }
    assert.equal(isSafeHttpsUrl("https://example.com/x.mp3"), true);
  });
});

describe("slug title stripping", () => {
  it("keeps names, drops ids and tokens", () => {
    assert.equal(
      titleFromSlug("GrowthX-AI-Deepan-SaaS-Labs-::01KTWE0E8PDEV1EMC9ATA190E9"),
      "GrowthX AI Deepan SaaS Labs",
    );
    assert.equal(
      titleFromSlug("weekly-sync-2026_recording.mp4"),
      "weekly sync recording",
    );
    assert.equal(titleFromSlug("bCQM"), "bCQM");
    assert.equal(titleFromSlug("::01KTWE0E8PDEV1EMC9ATA190E9"), null);
  });
});

describe("media extraction from share pages", () => {
  it("og:video, twitter stream, video tags, JSON-LD, bare URLs", () => {
    assert.equal(
      extractMediaUrlFromHtml(
        '<meta property="og:video:secure_url" content="https://cdn.x.com/v.mp4" />',
      ),
      "https://cdn.x.com/v.mp4",
    );
    assert.equal(
      extractMediaUrlFromHtml(
        '<meta name="twitter:player:stream" content="https://cdn.x.com/s.mp4"/>',
      ),
      "https://cdn.x.com/s.mp4",
    );
    assert.equal(
      extractMediaUrlFromHtml('<video controls src="https://cdn.x.com/a.m4a?sig=1">'),
      "https://cdn.x.com/a.m4a?sig=1",
    );
    assert.equal(
      extractMediaUrlFromHtml('{"contentUrl":"https://cdn.x.com/rec.mp3"}'),
      "https://cdn.x.com/rec.mp3",
    );
    assert.equal(
      extractMediaUrlFromHtml("nothing here <p>hello</p>"),
      null,
    );
  });

  it("never returns an unsafe URL even if the page embeds one", () => {
    assert.equal(
      extractMediaUrlFromHtml('<video src="http://insecure.example/v.mp4">'),
      null,
    );
    assert.equal(
      extractMediaUrlFromHtml('<video src="https://192.168.0.9/v.mp4">'),
      null,
    );
  });
});

describe("resolution", () => {
  const htmlPage = (body: string) => ({
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n === "content-type" ? "text/html" : null) },
    text: async () => body,
  });

  it("drive folder → actionable error, no fetch attempted", async () => {
    let fetched = 0;
    const r = await resolveCallLink(
      "https://drive.google.com/drive/folders/1J8p83eHToOsssBmrX385r9QYEN0e8k3r",
      async () => {
        fetched += 1;
        return htmlPage("");
      },
    );
    assert.equal(r!.mediaUrl, null);
    assert.match(r!.error!, /FOLDER link/);
    assert.match(r!.error!, /file link/);
    assert.equal(fetched, 0);
  });

  it("share page with og:video resolves to the media", async () => {
    const r = await resolveCallLink(
      "https://fathom.video/share/bCQM_PAL9sbFHGxkpPTvHkKAiTsrMnGQ",
      async () =>
        htmlPage('<meta property="og:video" content="https://cdn.fathom.video/call.mp4">'),
    );
    assert.equal(r!.mediaUrl, "https://cdn.fathom.video/call.mp4");
  });

  it("login-walled page → provider-specific guidance, never a throw", async () => {
    const r = await resolveCallLink(
      "https://app.fireflies.ai/view/GrowthX-AI-Deepan-SaaS-Labs-::01KTWE0E8PDEV1EMC9ATA190E9",
      async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: async () => "",
      }),
    );
    assert.equal(r!.mediaUrl, null);
    assert.match(r!.error!, /Fireflies/);
    assert.equal(r!.parsed.title, "GrowthX AI Deepan SaaS Labs");
  });

  it("a URL that IS the media (content-type) resolves to itself", async () => {
    const r = await resolveCallLink("https://cdn.example.com/stream/8f2k1", async () => ({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === "content-type" ? "audio/mpeg" : null) },
      text: async () => "",
    }));
    assert.equal(r!.mediaUrl, "https://cdn.example.com/stream/8f2k1");
  });

  it("network failure degrades to guidance, not a crash", async () => {
    const r = await resolveCallLink(
      "https://www.loom.com/share/abc123def456",
      async () => {
        throw new Error("ECONNRESET");
      },
    );
    assert.equal(r!.mediaUrl, null);
    assert.match(r!.error!, /Loom/);
  });
});
