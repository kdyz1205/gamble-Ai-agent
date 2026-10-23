import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { cpus: 2 },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["sharp", "ffmpeg-static", "ffprobe-static", "fluent-ffmpeg"],
  turbopack: {
    root: process.cwd(),
  },
  devIndicators: false,
};

export default nextConfig;
