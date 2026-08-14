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

const PROVIDER_HELP: Partial<Record<CallLinkProvider, string>> = {
  fathom:
    "Couldn't reach the media behind this Fathom share link — the page may require login. Download the recording from Fathom and upload the file, or paste a direct media URL.",
  fireflies:
    "Couldn't reach the media behind this Fireflies link — Fireflies recordings usually require login. Download the audio from Fireflies (or use their API) and upload the file.",
  loom: "Couldn't reach the media behind this Loom link — the video may be private. Download it from Loom and upload the file.",
  zoom: "Zoom cloud recordings need the passcode-protected page — download the recording and upload the file instead.",
  gong: "Gong call pages require login — export the media from Gong and upload the file.",
  gdrive_file:
    "Couldn't download this Google Drive file. Set sharing to \"Anyone with the link\", paste the file link (drive.google.com/file/d/…), or download the audio and upload it.",
  direct:
    "This URL didn't serve audio and its page had no playable media. Paste a direct link to an audio file, or upload it.",
};

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  url?: string;
  headers: { get(n: string): string | null };
  text(): Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}>;

const MAX_PAGE_BYTES = 2_000_000;
const DEFAULT_DRIVE_MAX_BYTES = 100 * 1024 * 1024;
const GDRIVE_FILE_ID_RE = /^[\w-]{10,}$/;
const GDRIVE_DOWNLOAD_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "drive.usercontent.google.com",
]);

export type ResolvedCallLink = {
  parsed: ParsedCallLink;
  mediaUrl: string | null;
  /**
   * Google Drive `uc?export=download` often returns HTML interstitials that
   * Hear rejects as `invalid audio`. When set, the API must download bytes
   * server-side and upload them instead of passing mediaUrl to Hear.
   */
  localFetch: "gdrive" | null;
  /** Actionable message when mediaUrl is null and localFetch is unset. */
  error: string | null;
};

export type DriveDownloadResult =
  | {
      ok: true;
      bytes: Buffer;
      filename: string;
      contentType: string;
    }
  | { ok: false; error: string };

/** Pull the virus-scan / large-file confirm token from a Drive HTML page. */
export function extractDriveConfirmToken(html: string): string | null {
  const patterns = [
    /confirm=([0-9A-Za-z_-]+)/,
    /name=["']confirm["']\s+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["']\s+name=["']confirm["']/i,
  ];
  for (const pattern of patterns) {
    const token = html.match(pattern)?.[1];
    if (token && token !== "t" && token.toLowerCase() !== "download") {
      return token;
    }
  }
  return null;
}

export function filenameFromContentDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  if (star) {
    try {
      return decodeURIComponent(star.trim().replace(/["']/g, "")) || fallback;
    } catch {
      // fall through
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"/i)?.[1]
    ?? header.match(/filename\s*=\s*([^;]+)/i)?.[1];
  if (plain) return plain.trim().replace(/^["']|["']$/g, "") || fallback;
  return fallback;
}

function looksLikeHtml(bytes: Buffer, contentType: string): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;
  const head = bytes.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function sniffAudioContentType(bytes: Buffer, contentType: string, filename: string): string {
  if (/^(audio|video)\//i.test(contentType) && !/text\/html/i.test(contentType)) {
    return contentType.split(";")[0]!.trim();
  }
  if (bytes.length >= 12) {
    if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg";
    if (bytes.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
    if (bytes.toString("ascii", 0, 4) === "RIFF") return "audio/wav";
    if (bytes.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
    if (bytes.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
    if (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      return "video/webm";
    }
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  return contentType.split(";")[0]?.trim() || "application/octet-stream";
}

function ensureMediaExtension(filename: string, contentType: string): string {
  if (/\.(mp3|mp4|wav|m4a|webm|ogg|oga)$/i.test(filename)) return filename;
  if (/mpeg|mp3/i.test(contentType)) return `${filename}.mp3`;
  if (/wav/i.test(contentType)) return `${filename}.wav`;
  if (/webm/i.test(contentType)) return `${filename}.webm`;
  if (/mp4|m4a/i.test(contentType)) return `${filename}.m4a`;
  if (/ogg/i.test(contentType)) return `${filename}.ogg`;
  return filename;
}

function isAllowedDriveDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      GDRIVE_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function driveAccessDeniedMessage(html: string | null): string | null {
  if (!html) return null;
  if (
    /you need access|request access|sign in|accounts\.google|sorry, the file you have requested does not exist/i.test(
      html,
    )
  ) {
    return 'This Google Drive file isn\'t publicly downloadable. Open the file → Share → General access → "Anyone with the link", then paste the file link again — or download the audio and upload it.';
  }
  return null;
}

/**
 * Download a public Google Drive file as bytes. Never hands the naive
 * `uc?export=download` URL to Hear (that page is often HTML → invalid audio).
 */
export async function downloadGoogleDriveFile(
  fileId: string,
  opts: {
    fetchImpl?: FetchLike;
    maxBytes?: number;
  } = {},
): Promise<DriveDownloadResult> {
  if (!GDRIVE_FILE_ID_RE.test(fileId)) {
    return { ok: false, error: "Invalid Google Drive file id." };
  }

  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const maxBytes = opts.maxBytes ?? DEFAULT_DRIVE_MAX_BYTES;
  const fallbackName = `gdrive-${fileId.slice(0, 8)}`;

  const candidates = [
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
  ];

  let lastHtml: string | null = null;

  async function readOnce(url: string): Promise<DriveDownloadResult | "html"> {
    if (!isAllowedDriveDownloadUrl(url)) {
      return { ok: false, error: "Unexpected Google Drive redirect host." };
    }
    const response = await fetchImpl(url, {
      redirect: "follow",
      headers: {
        Accept: "*/*",
        "User-Agent": "OpenGongLite/1.0 (call analysis; +https://github.com)",
      },
    } as RequestInit);

    const finalUrl = response.url || url;
    if (finalUrl && !isAllowedDriveDownloadUrl(finalUrl)) {
      return { ok: false, error: "Unexpected Google Drive redirect host." };
    }

    if (!response.arrayBuffer) {
      return {
        ok: false,
        error: "Google Drive download requires a binary-capable fetch.",
      };
    }

    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) {
      return {
        ok: false,
        error: `Google Drive file is larger than ${(maxBytes / (1024 * 1024)).toFixed(0)}MB. Download it and upload a compressed audio clip instead.`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || looksLikeHtml(buf, contentType)) {
      lastHtml = buf.toString("utf8").slice(0, MAX_PAGE_BYTES);
      return "html";
    }

    const filename = ensureMediaExtension(
      filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        fallbackName,
      ),
      sniffAudioContentType(buf, contentType, fallbackName),
    );
    const sniffed = sniffAudioContentType(buf, contentType, filename);
    if (buf.length < 64) {
      return {
        ok: false,
        error:
          PROVIDER_HELP.gdrive_file ??
          "Google Drive returned an empty file.",
      };
    }

    return {
      ok: true,
      bytes: buf,
      filename,
      contentType: sniffed,
    };
  }

  try {
    for (const url of candidates) {
      const first = await readOnce(url);
      if (first !== "html") return first;

      const confirm = lastHtml ? extractDriveConfirmToken(lastHtml) : null;
      if (confirm) {
        const confirmed = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=${encodeURIComponent(confirm)}`;
        const second = await readOnce(confirmed);
        if (second !== "html") return second;
      }
    }
  } catch {
    return {
      ok: false,
      error:
        "Couldn't reach Google Drive for this link. Check the URL, or download the file and upload it.",
    };
  }

  return {
    ok: false,
    error:
      driveAccessDeniedMessage(lastHtml) ??
      PROVIDER_HELP.gdrive_file ??
      "Couldn't download this Google Drive file.",
  };
}

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
      localFetch: null,
      error:
        "This is a Google Drive FOLDER link — a specific file is needed. Open the folder, right-click the recording → Share → copy its file link (drive.google.com/file/d/…), make sure it's viewable by anyone with the link, and paste that.",
    };
  }

  // Drive file links: do not return uc?export=download as mediaUrl — Hear
  // fetches that URL itself and gets HTML → diarize "invalid audio".
  if (parsed.provider === "gdrive_file") {
    return { parsed, mediaUrl: null, localFetch: "gdrive", error: null };
  }

  if (parsed.directUrl) {
    return { parsed, mediaUrl: parsed.directUrl, localFetch: null, error: null };
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
        return {
          parsed,
          mediaUrl: parsed.url,
          localFetch: null,
          error: null,
        };
      }
      const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
      const media = extractMediaUrlFromHtml(html);
      if (media) {
        return { parsed, mediaUrl: media, localFetch: null, error: null };
      }
    }
  } catch {
    // fall through to the provider-specific message
  }

  return {
    parsed,
    mediaUrl: null,
    localFetch: null,
    error:
      PROVIDER_HELP[parsed.provider] ??
      "Couldn't resolve this link to a playable recording. Download the file and upload it instead.",
  };
}
