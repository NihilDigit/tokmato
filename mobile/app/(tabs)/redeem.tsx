/**
 * Redeem — F+H balances + time pool + wishlist redemption.
 *
 * Wishlist add/edit deferred to Phase 5b stub — for now use the web
 * UI to create wishes; mobile only redeems them.
 */

import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { WishlistItem } from "@tokmato/shared/types";
import { PageShell } from "../../components/PageShell";
import { EditorialText } from "../../components/EditorialText";
import { useTheme } from "../../lib/use-theme";
import { PoolSheet } from "../../components/sheets/PoolSheet";
import { WishRedeemSheet } from "../../components/sheets/WishRedeemSheet";

export default function Redeem() {
  const theme = useTheme();
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const wishlist = useStore((s) => s.wishlist);
  const [poolOpen, setPoolOpen] = useState(false);
  const [redeemTarget, setRedeemTarget] = useState<WishlistItem | null>(null);

  return (
    <PageShell>
      <ScrollView contentContainerStyle={{ gap: 28, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            REDEEM
          </EditorialText>
          <View style={{ flexDirection: "row", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <Stat label="F" value={ftoken} color={theme.color.tomato} />
            <Stat label="H" value={htoken} color={theme.color.sage} />
            <Stat label="时间池" value={`${timePool} min`} color={theme.color.tealDeep} />
          </View>
        </View>

        <Pressable
          onPress={() => setPoolOpen(true)}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderWidth: 1,
            borderColor: theme.color.tealDeep,
            borderRadius: 12,
          }}
        >
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            充能
          </EditorialText>
          <EditorialText weight="serif" size={20} color={theme.color.tealDeep} style={{ marginTop: 4 }}>
            把 F·H 兑成时间池分钟
          </EditorialText>
        </Pressable>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            WISHLIST
          </EditorialText>
          <View style={{ marginTop: 12, gap: 10 }}>
            {wishlist.length === 0 ? (
              <EditorialText weight="sans" size={13} color={theme.color.ink3}>
                还没有心愿。在 web 端添加，移动端会同步过来。
              </EditorialText>
            ) : (
              wishlist.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => setRedeemTarget(w)}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderWidth: 1,
                    borderColor: theme.color.rule,
                    borderRadius: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <EditorialText weight="kaiti" size={16} color={theme.color.ink}>
                      {w.name}
                    </EditorialText>
                    <EditorialText
                      weight="sans"
                      size={11}
                      color={theme.color.ink3}
                      style={{ marginTop: 4 }}
                    >
                      {w.pay} · {w.price}
                    </EditorialText>
                  </View>
                  <EditorialText weight="sans" size={12} color={theme.color.tomato}>
                    兑换 →
                  </EditorialText>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <PoolSheet open={poolOpen} onClose={() => setPoolOpen(false)} />
      <WishRedeemSheet
        open={Boolean(redeemTarget)}
        wish={redeemTarget}
        onClose={() => setRedeemTarget(null)}
      />
    </PageShell>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View>
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        {label}
      </EditorialText>
      <EditorialText weight="serif" size={36} color={color} style={{ marginTop: 4 }}>
        {String(value)}
      </EditorialText>
    </View>
  );
}
