import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tokmato — Token Tracker",
    short_name: "tokmato",
    description:
      "番茄 token 系统：把学习产出和娱乐消费用诚实的会计单位连起来。",
    start_url: "/home",
    display: "standalone",
    background_color: "#F4EFE6",
    theme_color: "#F4EFE6",
    orientation: "portrait",
    icons: [
      // Same PNG, declared twice with distinct purposes — Next's MetadataRoute
      // type only allows a single `purpose` per entry, but the Web Manifest
      // spec lets a UA pick the right icon by purpose at install time.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["productivity"],
    lang: "zh",
  };
}
