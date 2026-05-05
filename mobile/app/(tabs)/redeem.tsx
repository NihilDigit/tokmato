/**
 * Redeem — F+H balances + time pool + spending entry points.
 *
 * Spending verbs map to sheets:
 *   - 充能       → PoolSheet (F + H → time pool minutes)
 *   - 玩点什么   → PlaySheet (start an entertainment session, deducts pool)
 *   - 吃点好的   → FoodSheet (H spend on food)
 *   - 兑换心愿   → WishRedeemSheet (F + H → wishlist item)
 *   - + 添加心愿 → AddWishSheet
 */

import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { WishlistItem } from "@tokmato/shared/types";
import { PageShell } from "../../components/PageShell";
import { EditorialText } from "../../components/EditorialText";
import { useTheme } from "../../lib/use-theme";
import { PoolSheet } from "../../components/sheets/PoolSheet";
import { PlaySheet } from "../../components/sheets/PlaySheet";
import { FoodSheet } from "../../components/sheets/FoodSheet";
import { WishRedeemSheet } from "../../components/sheets/WishRedeemSheet";
import { AddWishSheet } from "../../components/sheets/AddWishSheet";

export default function Redeem() {
  const theme = useTheme();
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const wishlist = useStore((s) => s.wishlist);

  const [poolOpen, setPoolOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const [addWishOpen, setAddWishOpen] = useState(false);
  const [redeemTarget, setRedeemTarget] = useState<WishlistItem | null>(null);

  return (
    <PageShell>
      <ScrollView
        contentContainerStyle={{ gap: 28, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={{ gap: 10 }}>
          <ActionCard
            kicker="充能"
            label="把 F·H 兑成时间池"
            tone={theme.color.tealDeep}
            onPress={() => setPoolOpen(true)}
          />
          <ActionCard
            kicker="玩点什么"
            label="启动一段娱乐 timer"
            tone={theme.color.sage}
            onPress={() => setPlayOpen(true)}
          />
          <ActionCard
            kicker="吃点好的"
            label="H 扣食物饮料"
            tone={theme.color.gold}
            onPress={() => setFoodOpen(true)}
          />
        </View>

        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <EditorialText weight="sans" size={11} color={theme.color.ink3}>
              WISHLIST
            </EditorialText>
            <Pressable
              onPress={() => setAddWishOpen(true)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.color.rule,
              }}
            >
              <EditorialText weight="sans" size={12} color={theme.color.ink2}>
                + 添加
              </EditorialText>
            </Pressable>
          </View>
          <View style={{ marginTop: 12, gap: 10 }}>
            {wishlist.length === 0 ? (
              <EditorialText weight="sans" size={13} color={theme.color.ink3}>
                还没有心愿。点击右上角添加，或在 web 端添加后等同步过来。
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
                      {`${w.pay} · ¥${w.price}`}
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
      <PlaySheet open={playOpen} onClose={() => setPlayOpen(false)} />
      <FoodSheet open={foodOpen} onClose={() => setFoodOpen(false)} />
      <AddWishSheet open={addWishOpen} onClose={() => setAddWishOpen(false)} />
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

function ActionCard({
  kicker,
  label,
  tone,
  onPress,
}: {
  kicker: string;
  label: string;
  tone: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderWidth: 1,
        borderColor: tone,
        borderRadius: 12,
      }}
    >
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        {kicker}
      </EditorialText>
      <EditorialText weight="serif" size={20} color={tone} style={{ marginTop: 4 }}>
        {label}
      </EditorialText>
    </Pressable>
  );
}
