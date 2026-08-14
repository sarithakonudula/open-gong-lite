import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Railway / Docker self-host (see docs.railway.com/guides/nextjs).
  output: "standalone",
  // Auth `proxy.ts` buffers request bodies (default 10MB). Uploads allow 25MB
  // plus multipart overhead, so raise this or FormData parsing fails mid-body.
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
