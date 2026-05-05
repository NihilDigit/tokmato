/**
 * Tab bar — five routes mirror the web app: Home / Journey / Redeem /
 * Kanban / Settings. Labels match web's English strings (CLAUDE.md
 * "mobile tab labels match desktop").
 *
 * Style is theme-resolved at render time via `useTheme()` rather than
 * via Unistyles' `StyleSheet.create` — the screen options object only
 * accepts a flat ViewStyle / TextStyle, and we don't need the runtime
 * theme switching that Unistyles offers for static tab chrome.
 */

import { Tabs } from "expo-router";
import { useTheme } from "../../lib/use-theme";

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.color.paper2,
          borderTopColor: theme.color.rule,
          height: theme.layout.mobileNavHeight,
        },
        tabBarLabelStyle: {
          fontFamily: theme.fonts.sans,
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="journey" options={{ title: "Journey" }} />
      <Tabs.Screen name="redeem" options={{ title: "Redeem" }} />
      <Tabs.Screen name="kanban" options={{ title: "Kanban" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
