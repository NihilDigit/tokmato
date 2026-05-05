import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@tokmato/shared/store";
import { useThemeColors } from "../../lib/use-theme";

// Phase 5 will replace with the radial-menu gesture port (RNGH +
// reanimated). Phase 2 just shows column counts to confirm shape.
export default function Kanban() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const kanban = useStore((s) => s.kanban);
  const cols: { id: keyof typeof kanban; label: string }[] = [
    { id: "inbox", label: "Inbox" },
    { id: "Q1", label: "Q1 重要紧急" },
    { id: "Q2", label: "Q2 重要不紧急" },
    { id: "Q3", label: "Q3 紧急不重要" },
    { id: "Q4", label: "Q4 都不" },
  ];

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
        Kanban
      </Text>
      <View style={{ marginTop: 24, gap: 12 }}>
        {cols.map((c) => (
          <View
            key={c.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: colors.rule,
              paddingBottom: 8,
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 15 }}>{c.label}</Text>
            <Text style={{ color: colors.ink3, fontSize: 15 }}>
              {kanban[c.id].length}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
