// Call-link resolver — people paste whatever their recorder gave them, not
// a direct audio URL. This module takes the link shapes that actually show
// up (Fathom shares, Fireflies views, Google Drive files/folders, Loom,
// Zoom, Gong, plain media URLs), classifies them, strips the contact and
// speaker names embedded in the slug into a clean title, and resolves a
// direct media URL where one can honestly be had. When it can't (private
// pages, Drive folders), the error says exactly what to paste instead —
// never a generic "invalid URL".

export type CallLinkProvider =
  | "direct"
  | "fathom"
  | "fireflies"
  | "gdrive_file"
  | "gdrive_folder"
  | "loom"
  | "zoom"
  | "gong";

export type ParsedCallLink = {
  provider: CallLinkProvider;
  url: string;
  /** Provider-side id/token, when the link carries one. */
  id: string | null;
  /** Human title recovered from the slug — names de-hyphenated, ids stripped. */
  title: string | null;
  /** Direct media URL when derivable without scraping (direct / Drive file). */
  directUrl: string | null;
};

// ── SSRF guards (shared with the analyze route) ─────────────────────────────

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b! >= 16 && b! <= 31) return true;
  }
  if (host === "::1" || host.startsWith("[") || host.includes(":")) return true;
  return false;
}

export function isSafeHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (isBlockedHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Slug → human title ("GrowthX-AI-Deepan-SaaS-Labs-::01KTW…" → names) ────

/** Strip ids/tokens, de-hyphenate, and title the names a slug carries. */
export function titleFromSlug(slug: string): string | null {
  const namePart = slug.split("::")[0] ?? slug;
  const words = namePart
    .replace(/\.(mp3|mp4|wav|m4a|webm|ogg)$/i, "")
    .split(/[-_+]+/)
    .map((w) => decodeURIComponent(w).trim())
    // Drop bare ids: long tokens with digits, or pure numbers/hex.
    .filter((w) => w.length > 0)
    .filter((w) => !(w.length >= 10 && /\d/.test(w)))
    .filter((w) => !/^\d+$/.test(w) && !/^[0-9a-f]{6,}$/i.test(w));
  if (words.length === 0) return null;
  const title = words.join(" ").replace(/\s+/g, " ").trim();
  return title.length >= 3 ? title.slice(0, 120) : null;
}

// ── Provider classification ─────────────────────────────────────────────────

const MEDIA_EXT = /\.(mp3|mp4|wav|m4a|webm|ogg)(\?|$)/i;

export function parseCallLink(rawUrl: string): ParsedCallLink | null {
  if (!isSafeHttpsUrl(rawUrl)) return null;
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // Google Drive — folders can't yield a file without auth; files can.
  if (host === "drive.google.com" || host === "docs.google.com") {
    const fileMatch = path.match(/\/file\/d\/([\w-]{10,})/);
    const idParam = url.searchParams.get("id");
    const fileId = fileMatch?.[1] ?? (path.includes("/uc") ? idParam : null);
    if (fileId) {
      return {
        provider: "gdrive_file",
        url: rawUrl,
        id: fileId,
        title: null,
        directUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      };
    }
    if (path.includes("/folders/") || path.includes("/drive/")) {
      const folderId = path.match(/\/folders\/([\w-]{10,})/)?.[1] ?? null;
      return {
        provider: "gdrive_folder",
        url: rawUrl,
        id: folderId,
        title: null,
        directUrl: null,
      };
    }
  }

  if (host.endsWith("fathom.video")) {
    const token = path.match(/\/(?:share|calls?)\/([\w-]+)/)?.[1] ?? null;
    return { provider: "fathom", url: rawUrl, id: token, title: null, directUrl: null };
  }

  if (host.endsWith("fireflies.ai")) {
    const slug = path.match(/\/view\/([^/]+)/)?.[1] ?? null;
    return {
      provider: "fireflies",
      url: rawUrl,
      id: slug?.split("::")[1] ?? slug,
      title: slug ? titleFromSlug(slug) : null,
      directUrl: null,
    };
  }

  if (host.endsWith("loom.com")) {
    const id = path.match(/\/share\/([\w-]+)/)?.[1] ?? null;
    return { provider: "loom", url: rawUrl, id, title: null, directUrl: null };
  }

  if (host.endsWith("zoom.us") || host.endsWith("zoom.com")) {
    const id = path.match(/\/rec(?:ording)?\/(?:share|play)\/([\w.-]+)/)?.[1] ?? null;
    return { provider: "zoom", url: rawUrl, id, title: null, directUrl: null };
  }

  if (host.includes("gong.io")) {
    const id = url.searchParams.get("id") ?? path.match(/\/call\/([\w-]+)/)?.[1] ?? null;
    return { provider: "gong", url: rawUrl, id, title: null, directUrl: null };
  }

  // Anything else: direct media if the path looks like audio/video; else we
  // still try it as a page and scrape for media.
  const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
  return {
    provider: "direct",
    url: rawUrl,
    id: null,
    title: MEDIA_EXT.test(path) ? titleFromSlug(lastSegment) : null,
    directUrl: MEDIA_EXT.test(path) ? rawUrl : null,
  };
}

// ── Page scrape: recover a media URL from a public share page ───────────────

/**
 * Pull the first playable media URL out of a share page's HTML: OpenGraph
 * video/audio tags, twitter player streams, <video>/<audio>/<source> tags,
 * JSON-LD contentUrl, or a bare media link. Pure — unit-testable.
 */
export function extractMediaUrlFromHtml(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i,
    /<meta[^>]+property=["']og:audio(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    /<(?:video|audio|source)[^>]+src=["']([^"']+\.(?:mp3|mp4|wav|m4a|webm|ogg)[^"']*)["']/i,
    /"contentUrl"\s*:\s*"(https:[^"]+\.(?:mp3|mp4|wav|m4a|webm|ogg)[^"]*)"/i,
    /(https:\/\/[^"'\s\\]+\.(?:mp3|mp4|wav|m4a|webm)\b[^"'\s\\]*)/i,
  ];
  for (const pattern of patterns) {
    const candidate = html.match(pattern)?.[1];
    if (!candidate) continue;
    const cleaned = candidate.replace(/\\u002F/gi, "/").replace(/&amp;/g, "&");
    if (isSafeHttpsUrl(cleaned)) return cleaned;
  }
  return null;
}

export type ResolvedCallLink = {
  parsed: ParsedCallLink;
  mediaUrl: string | null;
  /** Actionable message when mediaUrl is null. */
  error: string | null;
};

const PROVIDER_HELP: Partial<Record<CallLinkProvider, string>> = {
  fathom:
    "Couldn't reach the media behind this Fathom share link — the page may require login. Download the recording from Fathom and upload the file, or paste a direct media URL.",
  fireflies:
    "Couldn't reach the media behind this Fireflies link — Fireflies recordings usually require login. Download the audio from Fireflies (or use their API) and upload the file.",
  loom: "Couldn't reach the media behind this Loom link — the video may be private. Download it from Loom and upload the file.",
  zoom: "Zoom cloud recordings need the passcode-protected page — download the recording and upload the file instead.",
  gong: "Gong call pages require login — export the media from Gong and upload the file.",
  direct:
    "This URL didn't serve audio and its page had no playable media. Paste a direct link to an audio file, or upload it.",
};

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; headers: { get(n: string): string | null }; text(): Promise<string> }>;

const MAX_PAGE_BYTES = 2_000_000;

/**
 * Best-effort resolution to something PyAI Hear can fetch. Never throws:
 * every failure comes back as a parsed link + actionable error.
 */
export async function resolveCallLink(
  rawUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<ResolvedCallLink | null> {
  const parsed = parseCallLink(rawUrl);
  if (!parsed) return null;

  if (parsed.provider === "gdrive_folder") {
    return {
      parsed,
      mediaUrl: null,
      error:
        "This is a Google Drive FOLDER link — a specific file is needed. Open the folder, right-click the recording → Share → copy its file link (drive.google.com/file/d/…), make sure it's viewable by anyone with the link, and paste that.",
    };
  }

  if (parsed.directUrl) {
    return { parsed, mediaUrl: parsed.directUrl, error: null };
  }

  // Share page: fetch it (SSRF-guarded https, capped size) and scrape.
  try {
    const response = await fetchImpl(parsed.url, {
      headers: { Accept: "text/html,*/*" },
      redirect: "follow",
    } as RequestInit);
    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      // The "page" may itself be the media (some direct links lack extensions).
      if (/^(audio|video)\//i.test(contentType)) {
        return { parsed, mediaUrl: parsed.url, error: null };
      }
      const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
      const media = extractMediaUrlFromHtml(html);
      if (media) return { parsed, mediaUrl: media, error: null };
    }
  } catch {
    // fall through to the provider-specific message
  }

  return {
    parsed,
    mediaUrl: null,
    error:
      PROVIDER_HELP[parsed.provider] ??
      "Couldn't resolve this link to a playable recording. Download the file and upload it instead.",
  };
}
