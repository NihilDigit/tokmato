import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev requests from 127.0.0.1 (some browsers/test harnesses normalize to it)
  // and 10.0.2.2 (Android emulator's loopback to the host machine).
  allowedDevOrigins: ["127.0.0.1", "localhost", "10.0.2.2", "10.62.72.18"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
