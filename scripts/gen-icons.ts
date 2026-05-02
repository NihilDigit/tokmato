// Generate PWA icons (PNG) from an inline SVG tomato glyph.
// Run: bunx tsx scripts/gen-icons.ts   (or `bun run scripts/gen-icons.ts`)

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PUBLIC_DIR = resolve(process.cwd(), "public");
mkdirSync(PUBLIC_DIR, { recursive: true });

// Transparent-background square w/ centered tomato.
// Designed at 512×512 viewBox; sharp rasterizes to target sizes.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M256 130 C 156 130, 80 200, 80 320 C 80 440, 160 470, 256 470 C 352 470, 432 440, 432 320 C 432 200, 356 130, 256 130 Z" fill="#E14A2B"/>
  <ellipse cx="180" cy="240" rx="55" ry="36" fill="rgba(255,255,255,0.35)" transform="rotate(-25 180 240)"/>
  <path d="M256 138 C 240 95, 220 75, 175 60 C 200 90, 200 115, 215 130" fill="#6F8265"/>
  <path d="M256 138 C 275 95, 305 75, 350 60 C 320 90, 308 115, 290 138" fill="#7B9170"/>
</svg>`;

async function render(size: number, filename: string) {
  const out = resolve(PUBLIC_DIR, filename);
  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  wrote ${filename} (${size}×${size})`);
}

await render(192, "icon-192.png");
await render(512, "icon-512.png");
// iOS Safari "Add to Home Screen" — no maskable concept, kept square.
await render(180, "apple-touch-icon.png");

console.log("icons generated");
