import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev requests from 127.0.0.1 (some browsers/test harnesses normalize to it).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
