/**
 * EditorialText — bridges the unicode-range gap between web's font
 * stack and RN. Web uses `font-family: "CJKKai", "Instrument Serif"`
 * with a CJK unicode-range so each glyph picks up the right family
 * automatically. RN has no per-glyph fallback, so we split on a CJK
 * regex and render each segment in its appropriate stack.
 *
 * Usage:
 *   <EditorialText weight="serif" size={48}>番茄 25 minutes</EditorialText>
 *
 * `weight: "kaiti"` forces the kaiti stack on the entire string —
 * useful for headings that should read 楷体 even for the trailing
 * arabic numerals.
 *
 * Limitation: punctuation (．。、！？) lives in the U+3000-9FFF range
 * the regex below covers, so it sticks with neighboring CJK. ASCII
 * punctuation falls into the latin segment, which is the right look
 * for `25 min` etc.
 */

import { Text, type TextStyle, type TextProps } from "react-native";
import { useMemo } from "react";
import { useTheme } from "../lib/use-theme";

const CJK_RE = /[　-鿿＀-￯]/;

export type EditorialWeight = "serif" | "kaiti" | "sans" | "mono";

export interface EditorialTextProps extends Omit<TextProps, "children"> {
  children: string;
  weight?: EditorialWeight;
  size?: number;
  italic?: boolean;
  color?: string;
  /** Override the kaiti stack to use the same family for the whole
   *  string. Useful when the string is pure CJK and you want to skip
   *  the regex split overhead. */
  uniform?: boolean;
}

type Segment = { text: string; isCjk: boolean };

function segment(input: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  let bufIsCjk = false;
  for (const ch of input) {
    const isCjk = CJK_RE.test(ch);
    if (buf === "") {
      buf = ch;
      bufIsCjk = isCjk;
      continue;
    }
    if (isCjk === bufIsCjk) {
      buf += ch;
    } else {
      out.push({ text: buf, isCjk: bufIsCjk });
      buf = ch;
      bufIsCjk = isCjk;
    }
  }
  if (buf) out.push({ text: buf, isCjk: bufIsCjk });
  return out;
}

export function EditorialText({
  children,
  weight = "serif",
  size,
  italic,
  color,
  uniform,
  style,
  ...rest
}: EditorialTextProps) {
  const theme = useTheme();
  const segments = useMemo(
    () => (uniform ? null : segment(children)),
    [children, uniform],
  );

  const baseStyle: TextStyle = {
    fontSize: size,
    color: color ?? theme.color.ink,
    fontStyle: italic ? "italic" : "normal",
  };

  if (uniform || !segments) {
    const family =
      weight === "kaiti"
        ? theme.fonts.kaiti
        : weight === "sans"
          ? theme.fonts.sans
          : weight === "mono"
            ? theme.fonts.mono
            : italic
              ? theme.fonts.serifItalic
              : theme.fonts.serif;
    return (
      <Text {...rest} style={[baseStyle, { fontFamily: family }, style]}>
        {children}
      </Text>
    );
  }

  return (
    <Text {...rest} style={[baseStyle, style]}>
      {segments.map((seg, i) => {
        const family = seg.isCjk
          ? theme.fonts.kaiti
          : weight === "sans"
            ? theme.fonts.sans
            : weight === "mono"
              ? theme.fonts.mono
              : italic
                ? theme.fonts.serifItalic
                : theme.fonts.serif;
        return (
          <Text key={i} style={{ fontFamily: family }}>
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}
