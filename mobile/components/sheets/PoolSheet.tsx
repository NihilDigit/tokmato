/**
 * PoolSheet — recharge the time pool by spending F + H.
 * Mirrors `components/sheets/PoolSheet.tsx`. Conversion ratio matches
 * web: 1 F = 5 min, 1 H = 5 min (so F+H both at 1 = 10 min recharge).
 */

import { useState } from "react";
import { Pressable, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const F_TO_MIN = 5;
const H_TO_MIN = 5;

export function PoolSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const recharge = useStore((s) => s.recharge);

  const [fSpend, setFSpend] = useState(0);
  const [hSpend, setHSpend] = useState(0);

  const minutesGained = Math.round(fSpend * F_TO_MIN + hSpend * H_TO_MIN);
  const canConfirm =
    fSpend > 0 || hSpend > 0
      ? fSpend <= ftoken && hSpend <= htoken
      : false;

  function confirm() {
    if (!canConfirm) return;
    recharge({ fSpent: fSpend, hSpent: hSpend, minutesGained });
    setFSpend(0);
    setHSpend(0);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["55%"]}>
      <View style={{ gap: 20 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            POOL
          </EditorialText>
          <EditorialText
            weight="serif"
            size={26}
            color={theme.color.ink}
            style={{ marginTop: 4 }}
          >
            充能
          </EditorialText>
          <EditorialText weight="sans" size={12} color={theme.color.ink3} style={{ marginTop: 4 }}>
            当前 · F {ftoken} · H {htoken} · 池 {timePool} min
          </EditorialText>
        </View>

        <Spinner
          label="F 投入"
          value={fSpend}
          color={theme.color.tomato}
          max={ftoken}
          onChange={setFSpend}
        />
        <Spinner
          label="H 投入"
          value={hSpend}
          color={theme.color.sage}
          max={htoken}
          onChange={setHSpend}
        />

        <View
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: theme.color.tealSoft,
            borderRadius: 10,
          }}
        >
          <EditorialText weight="sans" size={11} color={theme.color.tealDeep}>
            预计获得
          </EditorialText>
          <EditorialText
            weight="serif"
            size={32}
            color={theme.color.tealDeep}
            style={{ marginTop: 4 }}
          >
            {minutesGained} min
          </EditorialText>
        </View>

        <Pressable
          onPress={confirm}
          disabled={!canConfirm}
          style={{
            paddingVertical: 14,
            backgroundColor: canConfirm ? theme.color.ink : theme.color.paper3,
            borderRadius: 12,
            opacity: canConfirm ? 1 : 0.5,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            充能
          </EditorialText>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Spinner({
  label,
  value,
  color,
  max,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  max: number;
  onChange: (n: number) => void;
}) {
  const theme = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <EditorialText weight="sans" size={12} color={theme.color.ink3}>
          {label} · 上限 {max}
        </EditorialText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Btn label="−" onPress={() => onChange(Math.max(0, value - 1))} />
          <EditorialText
            weight="serif"
            size={26}
            color={color}
            style={{ minWidth: 36, textAlign: "center" }}
          >
            {value}
          </EditorialText>
          <Btn label="+" onPress={() => onChange(Math.min(max, value + 1))} />
        </View>
      </View>
    </View>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.color.rule,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <EditorialText weight="serif" size={18} color={theme.color.ink}>
        {label}
      </EditorialText>
    </Pressable>
  );
}
