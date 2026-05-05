/**
 * WishRedeemSheet — spend F + H to redeem a wishlist item.
 * Mirrors `components/sheets/WishRedeemSheet.tsx` (web). The split
 * between F and H spend depends on the wish's `pay` mode:
 *   - "F"     → fSpent = price, hSpent = 0
 *   - "H"     → fSpent = 0,    hSpent = price
 *   - "mixed" → user picks the split via a slider
 * For Phase 5 simplicity, mixed always splits 50/50 — full slider
 * is a small follow-up.
 */

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { WishlistItem } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

export function WishRedeemSheet({
  open,
  wish,
  onClose,
}: {
  open: boolean;
  wish: WishlistItem | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const redeemWish = useStore((s) => s.redeemWish);

  const split = useMemo(() => {
    if (!wish) return { f: 0, h: 0 };
    if (wish.pay === "F") return { f: wish.price, h: 0 };
    if (wish.pay === "H") return { f: 0, h: wish.price };
    const half = Math.round(wish.price / 2);
    return { f: half, h: wish.price - half };
  }, [wish]);

  const canRedeem = wish ? split.f <= ftoken && split.h <= htoken : false;
  const [busy, setBusy] = useState(false);

  function confirm() {
    if (!wish || !canRedeem) return;
    setBusy(true);
    redeemWish({ wishId: wish.id, fSpent: split.f, hSpent: split.h });
    setBusy(false);
    onClose();
  }

  if (!wish) return null;

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["50%"]}>
      <View style={{ gap: 18 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            REDEEM
          </EditorialText>
          <EditorialText
            weight="serif"
            size={28}
            color={theme.color.ink}
            style={{ marginTop: 4 }}
          >
            {wish.name}
          </EditorialText>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 24,
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderWidth: 1,
            borderColor: theme.color.rule,
            borderRadius: 10,
          }}
        >
          <Number label="F 支付" value={split.f} color={theme.color.tomato} />
          <Number label="H 支付" value={split.h} color={theme.color.sage} />
          <Number label="总价" value={wish.price} color={theme.color.ink} />
        </View>

        {!canRedeem ? (
          <EditorialText weight="sans" size={12} color={theme.color.plum}>
            余额不足。需要 F {split.f} / H {split.h}，当前 F {ftoken} / H {htoken}。
          </EditorialText>
        ) : null}

        <Pressable
          onPress={confirm}
          disabled={!canRedeem || busy}
          style={{
            paddingVertical: 14,
            backgroundColor: canRedeem ? theme.color.tomato : theme.color.paper3,
            borderRadius: 12,
            opacity: canRedeem && !busy ? 1 : 0.5,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            兑换
          </EditorialText>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Number({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        {label}
      </EditorialText>
      <EditorialText
        weight="serif"
        size={26}
        color={color}
        style={{ marginTop: 4 }}
      >
        {value}
      </EditorialText>
    </View>
  );
}
