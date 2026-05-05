/**
 * PageShell — RN port of `.page-shell`. Applies safe-area padding,
 * fluid horizontal padding, and capped max-width.
 */

import type { ReactNode } from "react";
import { View, useWindowDimensions, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../lib/use-theme";
import { layout, fluid } from "../styles/tokens";

export function PageShell({
  children,
  style,
  scroll,
}: {
  children: ReactNode;
  style?: ViewStyle;
  scroll?: false;
}) {
  void scroll; // ScrollView variant lives in screens that need it.
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const padX = fluid(layout.pagePadX, width);
  const padY = fluid(layout.pagePadY, width);

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.paper,
          paddingTop: insets.top + padY,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left + padX,
          paddingRight: insets.right + padX,
        },
        style,
      ]}
    >
      <View style={{ width: "100%", maxWidth: layout.pageMaxWidth, alignSelf: "center", flex: 1 }}>
        {children}
      </View>
    </View>
  );
}
