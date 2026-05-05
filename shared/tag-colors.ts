/**
 * Tag color → Tailwind utility class mappings.
 *
 * Tailwind can't generate `bg-${color}` dynamically — every utility class
 * the project uses must appear as a literal somewhere the JIT can scan.
 * This module is the single literal source for all tag-color renderings.
 *
 * `text-paper` auto-inverts: in light mode `paper` is `#f4efe6` (light text
 * on the dark-ish chip bg); in dark mode `paper` is `#1a1614` (dark text
 * on the lifted dark-mode chip bg). Both modes get adequate contrast
 * without per-color text decisions.
 */

import type { TagColor } from "./types";

/** Filled chip — bg + auto-inverting text. Used in StartSheet picker,
 *  history rows, anywhere the tag is rendered as a filled token. */
export const TAG_CHIP_CLASSES: Record<TagColor, string> = {
  tomato: "bg-tomato text-paper",
  sage: "bg-sage text-paper",
  teal: "bg-teal text-paper",
  gold: "bg-gold text-paper",
  plum: "bg-plum text-paper",
  ocean: "bg-ocean text-paper",
  moss: "bg-moss text-paper",
  amber: "bg-amber text-paper",
  rose: "bg-rose text-paper",
  slate: "bg-slate text-paper",
};

/** Solid bg only — for swatches, dot indicators, color-picker tiles. */
export const TAG_BG_CLASSES: Record<TagColor, string> = {
  tomato: "bg-tomato",
  sage: "bg-sage",
  teal: "bg-teal",
  gold: "bg-gold",
  plum: "bg-plum",
  ocean: "bg-ocean",
  moss: "bg-moss",
  amber: "bg-amber",
  rose: "bg-rose",
  slate: "bg-slate",
};

/** Foreground color only — for tinted text labels. */
export const TAG_TEXT_CLASSES: Record<TagColor, string> = {
  tomato: "text-tomato",
  sage: "text-sage",
  teal: "text-teal",
  gold: "text-gold",
  plum: "text-plum",
  ocean: "text-ocean",
  moss: "text-moss",
  amber: "text-amber",
  rose: "text-rose",
  slate: "text-slate",
};

export function tagChipClasses(color: TagColor): string {
  return TAG_CHIP_CLASSES[color];
}

export function tagBgClasses(color: TagColor): string {
  return TAG_BG_CLASSES[color];
}

export function tagTextClasses(color: TagColor): string {
  return TAG_TEXT_CLASSES[color];
}
