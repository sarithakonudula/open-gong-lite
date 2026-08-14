import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Railway / Docker self-host (see docs.railway.com/guides/nextjs).
  output: "standalone",
  // Keep the native ffmpeg binary out of the bundler; we spawn it at runtime.
  serverExternalPackages: ["ffmpeg-static"],
  // Auth `proxy.ts` buffers request bodies (default 10MB). Uploads allow 100MB
  // plus multipart overhead, so raise this or FormData parsing fails mid-body.
  experimental: {
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
