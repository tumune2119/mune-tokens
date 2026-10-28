import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native server-only module stays out of the bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Local-only app: skip gzip so streamed AI output is flushed immediately.
  compress: false,
  poweredByHeader: false,
};

export default nextConfig;
