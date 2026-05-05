/**
 * AddWishSheet — create a wishlist item.
 *
 * Mirrors `components/sheets/AddWishSheet.tsx`. Web uses an `<input
 * type="range">`; RN substitutes a stepper + presets row to keep the
 * dependency graph small. Pay mode is the same 3-way segmented chip set
 * (F / H / 混合).
 */

import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

type Pay = "F" | "H" | "mixed";

const PRICE_PRESETS = [50, 100, 300, 500, 1000];
const PRICE_MIN = 5;
const PRICE_MAX = 5000;
const PRICE_STEP = 5;

export function AddWishSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const addWish = useStore((s) => s.addWish);

  const [name, setName] = useState("");
  const [price, setPrice] = useState(100);
  const [pay, setPay] = useState<Pay>("mixed");
  const [why, setWhy] = useState("");

  useEffect(() => {
    if (open) return;
    setName("");
    setPrice(100);
    setPay("mixed");
    setWhy("");
  }, [open]);

  const valid = name.trim().length > 0 && price > 0;

  function bump(delta: number) {
    setPrice((p) => Math.max(PRICE_MIN, Math.min(PRICE_MAX, p + delta)));
  }

  function confirm() {
    if (!valid) return;
    addWish({
      name: name.trim(),
      price,
      pay,
      why: why.trim(),
    });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["88%"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 20, paddingBottom: 16 }}
      >
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            NEW WISH
          </EditorialText>
          <EditorialText weight="serif" size={26} color={theme.color.ink} style={{ marginTop: 4 }}>
            添加新愿望
          </EditorialText>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            名字
          </EditorialText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="想要点什么"
            placeholderTextColor={theme.color.inkMute}
            autoFocus
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
              {`¥ ${price}`}
            </EditorialText>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 10 }}>
            <StepBtn label="−10" onPress={() => bump(-PRICE_STEP * 2)} />
            <StepBtn label="−" onPress={() => bump(-PRICE_STEP)} />
            <StepBtn label="＋" onPress={() => bump(PRICE_STEP)} />
            <StepBtn label="+50" onPress={() => bump(50)} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginTop: 10 }}
          >
            {PRICE_PRESETS.map((p) => {
              const selected = price === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPrice(p)}
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

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            怎么付
          </EditorialText>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <PayBtn label="FToken" tone={theme.color.tomato} active={pay === "F"} onPress={() => setPay("F")} />
            <PayBtn label="HToken" tone={theme.color.sage} active={pay === "H"} onPress={() => setPay("H")} />
            <PayBtn label="混合" tone={theme.color.gold} active={pay === "mixed"} onPress={() => setPay("mixed")} />
          </View>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            为什么想要
          </EditorialText>
          <TextInput
            value={why}
            onChangeText={setWhy}
            placeholder="（选填）说服未来的自己花这笔钱"
            placeholderTextColor={theme.color.inkMute}
            multiline
            numberOfLines={3}
            style={{
              marginTop: 6,
              padding: 12,
              minHeight: 72,
              fontSize: 14,
              color: theme.color.ink,
              fontFamily: theme.fonts.kaiti,
              borderWidth: 1,
              borderColor: theme.color.rule,
              borderRadius: 10,
              textAlignVertical: "top",
            }}
          />
        </View>

        <Pressable
          onPress={confirm}
          disabled={!valid}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: valid ? theme.color.ink : theme.color.paper3,
            opacity: valid ? 1 : 0.5,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            添加
          </EditorialText>
        </Pressable>
      </ScrollView>
    </Sheet>
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

function PayBtn({
  active,
  label,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  tone: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active ? "transparent" : theme.color.rule,
        backgroundColor: active ? tone : "transparent",
        alignItems: "center",
      }}
    >
      <EditorialText weight="sans" size={13} color={active ? theme.color.paper : theme.color.ink}>
        {label}
      </EditorialText>
    </Pressable>
  );
}
