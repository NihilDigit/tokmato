import * as React from "react";

export interface TomatoIconProps {
  /** 0..1 — countdown progress. 0 = full tomato (start of session), 1 = empty (end). */
  progress?: number;
  /** Pixel size or CSS unit string. Default 220. */
  size?: number | string;
}

/**
 * Tomato SVG icon with countdown-progress fill.
 *
 * Server Component (no hooks beyond `useId`, no client-side state). Brand
 * colors are inlined as hex because SVG `<stop stop-color>` and `<path fill>`
 * attributes don't resolve CSS custom properties.
 *
 * Visual layers:
 *  - Body outline: dashed stroke, always visible.
 *  - Body fill + highlight: clipped by a `<rect>` whose height is driven by
 *    `(1 - progress)`, growing from the bottom up.
 *  - Stem & leaves: always visible, sit above the fill clip.
 */
export function TomatoIcon({ progress = 0, size = 220 }: TomatoIconProps) {
  const reactId = React.useId();
  const clipId = `tomato-clip-${reactId}`;
  const gradId = `tomato-grad-${reactId}`;

  // Clamp to [0, 1] so out-of-range values don't break the clip rect math.
  const p = Math.min(1, Math.max(0, progress));
  const fillHeight = 1 - p;
  const rectY = p * 200;
  const rectH = fillHeight * 200;

  const bodyPath =
    "M100 35 C 60 35, 30 65, 30 110 C 30 155, 62 180, 100 180 C 138 180, 170 155, 170 110 C 170 65, 140 35, 100 35 Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y={rectY} width="200" height={rectH} />
        </clipPath>
        <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FF6B47" />
          <stop offset="60%" stopColor="#E14A2B" />
          <stop offset="100%" stopColor="#B83A20" />
        </radialGradient>
      </defs>

      {/* Body outline — always visible, marks the empty silhouette. */}
      <path
        d={bodyPath}
        fill="none"
        stroke="rgba(26,22,20,0.18)"
        strokeWidth="2"
        strokeDasharray="3 4"
      />

      {/* Body fill + highlight — clipped by progress rect (fills from bottom up). */}
      <g clipPath={`url(#${clipId})`}>
        <path d={bodyPath} fill={`url(#${gradId})`} />
        <ellipse
          cx="72"
          cy="80"
          rx="22"
          ry="14"
          fill="rgba(255,255,255,0.35)"
          transform="rotate(-25 72 80)"
        />
      </g>

      {/* Stem & leaves — always visible, sit above the fill. */}
      <g>
        <path
          d="M100 38 C 95 25, 90 18, 80 14 C 86 22, 86 30, 90 36"
          fill="#6F8265"
        />
        <path
          d="M100 38 C 105 25, 112 20, 124 18 C 116 24, 112 30, 108 38"
          fill="#7B9170"
        />
        <path
          d="M100 38 C 100 28, 102 22, 105 16 C 102 24, 102 32, 102 40"
          fill="#5F7257"
        />
      </g>
    </svg>
  );
}
