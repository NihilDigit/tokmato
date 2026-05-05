/**
 * Hook returning the active theme's color palette. Switches with
 * `Appearance.getColorScheme()`. Useful for inline styles that don't go
 * through Unistyles (e.g. one-off Pressable border colors).
 */

import { useColorScheme } from "react-native";
import { lightTheme, darkTheme } from "../styles/tokens";

export function useThemeColors() {
  const scheme = useColorScheme();
  return (scheme === "dark" ? darkTheme : lightTheme).color;
}

export function useTheme() {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
}
