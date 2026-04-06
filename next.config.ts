import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "ffmpeg-static", "ffprobe-static", "fluent-ffmpeg"],
  turbopack: {
    root: process.cwd(),
  },
  devIndicators: false,
};

export default nextConfig;
