/**
 * Unistyles v3 wiring. Exposes a typed theme to `useStyles()` callers
 * and switches light/dark off `Appearance.getColorScheme()`. Theme
 * tokens live in `./tokens.ts`.
 */

import { StyleSheet } from "react-native-unistyles";
import { lightTheme, darkTheme, type Theme } from "./tokens";

const breakpoints = {
  xs: 0,
  sm: 360,
  md: 600,
  lg: 1024,
} as const;

type AppBreakpoints = typeof breakpoints;
type AppThemes = { light: Theme; dark: Theme };

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: { light: lightTheme, dark: darkTheme },
  breakpoints,
  settings: {
    adaptiveThemes: true,
  },
});
