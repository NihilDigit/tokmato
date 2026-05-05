import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@tokmato/shared/store";
import { useThemeColors } from "../../lib/use-theme";

// Phase 3 will replace with FlashList ledger + F·H trend chart.
// For Phase 2 this just confirms shared-store reads work.
export default function Journey() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const tokenHistory = useStore((s) => s.tokenHistory);
  const pomodoroHistory = useStore((s) => s.pomodoroHistory);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        paddingTop: insets.top + 24,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: colors.ink3,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        Journey
      </Text>
      <Text style={{ color: colors.ink, marginTop: 24, fontSize: 16 }}>
        ledger entries: {tokenHistory.length}
      </Text>
      <Text style={{ color: colors.ink, marginTop: 8, fontSize: 16 }}>
        pomodoros: {pomodoroHistory.length}
      </Text>
    </View>
  );
}
