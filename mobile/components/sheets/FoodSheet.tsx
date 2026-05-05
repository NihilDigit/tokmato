/**
 * FoodSheet — spend H on food consumption.
 *
 * Two tabs: 常用 (preset list, single tap = consume) and 外卖/外食
 * (custom name + price stepper). Unlike WishRedeemSheet, food is H-only
 * at a 1 H = ¥5 rate (food has its own anti-binge ratio; wishlist mixes
 * F+H at 1 H = ¥10).
 *
 * Mirrors `components/sheets/FoodSheet.tsx` (web). Web's preset list
 * has an inline edit mode for renaming/removing presets — RN port keeps
 * the consume + add path; preset CRUD lives in Settings (or web).
 */

import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const FOOD_H_RATE = 5;
const PRICE_TO_H = (price: number) =>
  Math.round((price / FOOD_H_RATE) * 100) / 100;
const fmtH = (h: number) =>
  h % 1 === 0 ? h.toFixed(0) : h.toFixed(h < 1 ? 2 : 1);

const PRICE_PRESETS = [10, 20, 30, 50, 80, 120];

type Tab = "preset" | "custom";

export function FoodSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const htoken = useStore((s) => s.htoken);
  const presets = useStore((s) => s.foodPresets);
  const addFoodPreset = useStore((s) => s.addFoodPreset);
  const spendFood = useStore((s) => s.spendFood);

  const [tab, setTab] = useState<Tab>("preset");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState(20);
  const [savePreset, setSavePreset] = useState(false);

  useEffect(() => {
    if (open) return;
    setTab("preset");
    setCustomName("");
    setCustomPrice(20);
    setSavePreset(false);
  }, [open]);

  const customH = PRICE_TO_H(customPrice);
  const customAffordable = customH <= htoken && customName.trim().length > 0;

  function handlePresetTap(name: string, price: number) {
    const hSpent = PRICE_TO_H(price);
    if (hSpent > htoken) return;
    spendFood({ name, price, hSpent });
    onClose();
  }

  function handleCustom() {
    if (!customAffordable) return;
    const name = customName.trim();
    if (savePreset) addFoodPreset({ name, price: customPrice });
    spendFood({ name, price: customPrice, hSpent: customH });
    onClose();
  }

  function bump(delta: number) {
    setCustomPrice((p) => Math.max(1, p + delta));
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["85%"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 18, paddingBottom: 16 }}
      >
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            FOOD
          </EditorialText>
          <EditorialText weight="serif" size={26} color={theme.color.ink} style={{ marginTop: 4 }}>
            吃点好的
          </EditorialText>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.color.rule,
          }}
        >
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            HToken
          </EditorialText>
          <View style={{ alignItems: "flex-end" }}>
            <EditorialText weight="mono" size={26} color={theme.color.sage}>
              {`${htoken} H`}
            </EditorialText>
            <EditorialText weight="mono" size={11} color={theme.color.ink3}>
              {`食物 ¥${Math.floor(htoken * FOOD_H_RATE)}`}
            </EditorialText>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignSelf: "flex-start",
            padding: 4,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.color.rule,
          }}
        >
          <TabBtn label="常用" active={tab === "preset"} onPress={() => setTab("preset")} />
          <TabBtn label="外卖/外食" active={tab === "custom"} onPress={() => setTab("custom")} />
        </View>

        {tab === "preset" ? (
          <View style={{ gap: 8 }}>
            {presets.length === 0 ? (
              <EditorialText weight="sans" size={13} color={theme.color.ink3}>
                还没有常用项。切到外卖/外食先记一笔，可勾选保存为常用。
              </EditorialText>
            ) : (
              presets.map((p) => {
                const h = PRICE_TO_H(p.price);
                const afford = h <= htoken;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => handlePresetTap(p.name, p.price)}
                    disabled={!afford}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.color.rule,
                      backgroundColor: theme.color.paper2,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      opacity: afford ? 1 : 0.4,
                    }}
                  >
                    <EditorialText weight="kaiti" size={15} color={theme.color.ink}>
                      {p.name}
                    </EditorialText>
                    <View style={{ alignItems: "flex-end" }}>
                      <EditorialText weight="mono" size={14} color={theme.color.sage}>
                        {`− ${fmtH(h)} H`}
                      </EditorialText>
                      <EditorialText weight="mono" size={11} color={theme.color.ink3}>
                        {`¥${p.price}`}
                      </EditorialText>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <View>
              <EditorialText weight="sans" size={11} color={theme.color.ink3}>
                名字
              </EditorialText>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="星巴克 / 火锅 / ..."
                placeholderTextColor={theme.color.inkMute}
                style={{
                  marginTop: 6,
                  paddingVertical: 8,
                  fontSize: 17,
                  color: theme.color.ink,
                  fontFamily: theme.fonts.kaiti,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.color.rule,
                }}
              />
            </View>

            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <EditorialText weight="sans" size={11} color={theme.color.ink3}>
                  价格
                </EditorialText>
                <EditorialText weight="mono" size={20} color={theme.color.ink}>
                  {`¥ ${customPrice} · ${fmtH(customH)} H`}
                </EditorialText>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 10 }}>
                <StepBtn label="−10" onPress={() => bump(-10)} />
                <StepBtn label="−" onPress={() => bump(-1)} />
                <StepBtn label="＋" onPress={() => bump(1)} />
                <StepBtn label="+10" onPress={() => bump(10)} />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, marginTop: 10 }}
              >
                {PRICE_PRESETS.map((p) => {
                  const selected = customPrice === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setCustomPrice(p)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: selected ? theme.color.ink : theme.color.rule,
                        backgroundColor: selected ? theme.color.paper3 : "transparent",
                      }}
                    >
                      <EditorialText weight="mono" size={12} color={selected ? theme.color.ink : theme.color.ink3}>
                        {`¥${p}`}
                      </EditorialText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              onPress={() => setSavePreset((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 8,
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: savePreset ? theme.color.sage : theme.color.rule,
                  backgroundColor: savePreset ? theme.color.sage : "transparent",
                }}
              />
              <EditorialText weight="sans" size={13} color={theme.color.ink2}>
                同时保存为常用项
              </EditorialText>
            </Pressable>

            {!customAffordable && customName.trim().length > 0 ? (
              <EditorialText weight="sans" size={12} color={theme.color.plum}>
                {`H 不足 · 需 ${fmtH(customH)}，当前 ${htoken}`}
              </EditorialText>
            ) : null}

            <Pressable
              onPress={handleCustom}
              disabled={!customAffordable}
              style={{
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: customAffordable ? theme.color.sage : theme.color.paper3,
                opacity: customAffordable ? 1 : 0.5,
              }}
            >
              <EditorialText
                weight="sans"
                size={15}
                color={theme.color.paper}
                style={{ textAlign: "center" }}
              >
                记一笔
              </EditorialText>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

function TabBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: active ? theme.color.ink : "transparent",
      }}
    >
      <EditorialText
        weight="sans"
        size={12}
        color={active ? theme.color.paper : theme.color.ink3}
      >
        {label}
      </EditorialText>
    </Pressable>
  );
}

function StepBtn({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.color.rule,
      }}
    >
      <EditorialText weight="mono" size={14} color={theme.color.ink}>
        {label}
      </EditorialText>
    </Pressable>
  );
}
