import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@tokmato/shared/store";
import { useThemeColors } from "../../lib/use-theme";

// Phase 5 will replace with WishlistRedeemSheet + ledger.
export default function Redeem() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const wishlist = useStore((s) => s.wishlist);
  const timePool = useStore((s) => s.timePool);

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
        Redeem
      </Text>
      <Text style={{ color: colors.ink, marginTop: 24, fontSize: 16 }}>
        time pool: {timePool} min
      </Text>
      <Text style={{ color: colors.ink, marginTop: 8, fontSize: 16 }}>
        wishlist: {wishlist.length}
      </Text>
    </View>
  );
}
