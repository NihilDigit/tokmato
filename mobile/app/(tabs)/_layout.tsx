/**
 * Tab bar — five routes mirror the web app: Home / Journey / Redeem /
 * Kanban / Settings. Labels match web's English strings (CLAUDE.md
 * "mobile tab labels match desktop").
 */

import { Tabs } from "expo-router";
import { StyleSheet } from "react-native-unistyles";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabBarStyle(),
        tabBarLabelStyle: tabBarLabelStyle(),
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

const tabBarStyle = StyleSheet.create((theme) => ({
  backgroundColor: theme.color.paper2,
  borderTopColor: theme.color.rule,
  height: theme.layout.mobileNavHeight,
}));

const tabBarLabelStyle = StyleSheet.create((theme) => ({
  fontFamily: theme.fonts.sans,
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: "uppercase",
}));
