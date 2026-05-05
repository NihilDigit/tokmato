/**
 * Phase 2 home — proves the shared store is live in RN. Renders the
 * three balance numbers (FToken / HToken / 时间池) read from the same
 * Zustand store the web app uses.
 *
 * Phase 3 replaces this with the editorial RunningView / RemoteActiveView.
 */

import { View, Text, useWindowDimensions, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";

import { useStore } from "@tokmato/shared/store";
import { fluid } from "../../styles/tokens";
import { useThemeColors } from "../../lib/use-theme";

export default function Home() {
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const statSize = fluid({ min: 36, max: 56 }, width);

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
        Today
      </Text>

      <View style={{ marginTop: 32, gap: 24 }}>
        <Stat label="FToken" value={ftoken} color={colors.tomato} size={statSize} />
        <Stat label="HToken" value={htoken} color={colors.sage} size={statSize} />
        <Stat label="时间池" value={`${timePool} min`} color={colors.teal} size={statSize} />
      </View>

      <View style={{ marginTop: 48 }}>
        <Link href="/sign-in" asChild>
          <Pressable
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: colors.rule,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 14 }}>
              Sign in / 同步设置
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  size,
}: {
  label: string;
  value: number | string;
  color: string;
  size: number;
}) {
  const colors = useThemeColors();
  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          color: colors.ink3,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: size,
          color,
          fontWeight: "300",
          lineHeight: size * 1.05,
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
