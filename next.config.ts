import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Railway / Docker self-host (see docs.railway.com/guides/nextjs).
  output: "standalone",
};

export default nextConfig;
