/**
 * Design tokens — port of `app/globals.css` :root + [data-theme="dark"]
 * blocks into a TS object. Light/dark are sibling theme objects; the
 * Unistyles theme provider switches based on `Appearance.getColorScheme()`.
 *
 * Naming and values track the CSS variables 1:1 so the editorial design
 * system (paper / ink / tomato / sage / teal / gold / plum) renders
 * identically on RN. The places that intentionally diverge are noted
 * inline.
 */

type Palette = {
  paper: string;
  paper2: string;
  paper3: string;
  ink: string;
  ink2: string;
  ink3: string;
  inkMute: string;
  rule: string;
  rule2: string;
  tomato: string;
  tomatoDeep: string;
  tomatoSoft: string;
  sage: string;
  sageDeep: string;
  sageSoft: string;
  gold: string;
  goldSoft: string;
  teal: string;
  tealDeep: string;
  tealSoft: string;
  plum: string;
  ocean: string;
  moss: string;
  amber: string;
  rose: string;
  slate: string;
};

const lightPalette: Palette = {
  paper: "#f4efe6",
  paper2: "#eae3d5",
  paper3: "#ddd4c2",
  ink: "#1a1614",
  ink2: "#3a332d",
  ink3: "#6b6258",
  inkMute: "#9a9085",
  rule: "rgba(26, 22, 20, 0.12)",
  rule2: "rgba(26, 22, 20, 0.06)",

  tomato: "#e14a2b",
  tomatoDeep: "#b83a20",
  tomatoSoft: "#f4d8cf",
  sage: "#6f8265",
  sageDeep: "#4f5f47",
  sageSoft: "#d4dbca",
  gold: "#c8943a",
  goldSoft: "#ebddb8",
  teal: "#4a8b8c",
  tealDeep: "#335c5d",
  tealSoft: "#c9dddd",
  plum: "#7b4a6a",

  ocean: "#4a6b8b",
  moss: "#5a7a4e",
  amber: "#b87a32",
  rose: "#b15a6a",
  slate: "#5e6976",
};

const darkPalette: Palette = {
  paper: "#1a1614",
  paper2: "#221c18",
  paper3: "#2c2520",
  ink: "#f4efe6",
  ink2: "#d8d2c5",
  ink3: "#a89f93",
  inkMute: "#6b6258",
  rule: "rgba(244, 239, 230, 0.14)",
  rule2: "rgba(244, 239, 230, 0.07)",

  tomato: "#ff6a4a",
  tomatoDeep: "#ff8a72",
  tomatoSoft: "#4a2519",
  sage: "#9bb091",
  sageDeep: "#b6c9ad",
  sageSoft: "#2d3a28",
  gold: "#e0b860",
  goldSoft: "#423718",
  teal: "#6fb1b1",
  tealDeep: "#92cccd",
  tealSoft: "#1f3637",
  plum: "#b88ba9",

  ocean: "#8eb4cd",
  moss: "#94b385",
  amber: "#ddae65",
  rose: "#d49aa6",
  slate: "#9ba6b3",
};

/**
 * Fluid scale port — web uses `clamp(min, vw, max)`. RN replays this
 * via a width-derived helper at render time. Numbers below are
 * absolute breakpoints (small/large) — `fluid()` interpolates.
 */
export const typeScale = {
  display: { min: 48, max: 88 },
  h1: { min: 36, max: 56 },
  h2: { min: 28, max: 38 },
  h3: { min: 22, max: 32 },
  stat: { min: 36, max: 56 },
  balance: { min: 32, max: 44 },
  body: { min: 15, max: 17 },
  meta: { min: 12, max: 13 },
} as const;

const SMALL_W = 360;
const LARGE_W = 1024;

export function fluid(
  scale: { min: number; max: number },
  width: number,
): number {
  if (width <= SMALL_W) return scale.min;
  if (width >= LARGE_W) return scale.max;
  const t = (width - SMALL_W) / (LARGE_W - SMALL_W);
  return Math.round(scale.min + t * (scale.max - scale.min));
}

export const layout = {
  pageMaxWidth: 1180,
  pagePadX: { min: 16, max: 48 },
  pagePadY: { min: 20, max: 32 },
  mobileNavHeight: 64,
  borderRadius: 10,
  borderRadiusSmall: 6,
  borderRadiusLarge: 16,
} as const;

type ShadowSet = {
  soft: { color: string; radius: number; offsetY: number };
  lift: { color: string; radius: number; offsetY: number };
};

export const shadows: { light: ShadowSet; dark: ShadowSet } = {
  light: {
    soft: { color: "rgba(26,22,20,0.06)", radius: 24, offsetY: 8 },
    lift: { color: "rgba(26,22,20,0.12)", radius: 48, offsetY: 24 },
  },
  dark: {
    soft: { color: "rgba(0,0,0,0.4)", radius: 24, offsetY: 8 },
    lift: { color: "rgba(0,0,0,0.5)", radius: 48, offsetY: 24 },
  },
};

/**
 * Font stacks — note `kaiti` is intentionally separate. Web uses
 * `unicode-range` to fall English back to Instrument Serif and CJK
 * forward to 楷体; RN has no `unicode-range` analog. The
 * `<EditorialText>` component (Phase 3) splits strings on a CJK regex
 * and renders each segment with the appropriate stack.
 */
export const fonts = {
  // Loaded by expo-font in app/_layout.tsx.
  serif: "InstrumentSerif",
  serifItalic: "InstrumentSerif-Italic",
  kaiti: "STKaiti", // System font on iOS; falls back per-platform.
  sans: "InterTight",
  mono: "JetBrainsMono",
} as const;

export type Theme = {
  name: "light" | "dark";
  color: Palette;
  type: typeof typeScale;
  layout: typeof layout;
  shadows: ShadowSet;
  fonts: typeof fonts;
};

export const lightTheme: Theme = {
  name: "light",
  color: lightPalette,
  type: typeScale,
  layout,
  shadows: shadows.light,
  fonts,
};

export const darkTheme: Theme = {
  name: "dark",
  color: darkPalette,
  type: typeScale,
  layout,
  shadows: shadows.dark,
  fonts,
};
