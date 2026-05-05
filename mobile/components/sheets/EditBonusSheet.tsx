/**
 * EditBonusSheet — add or edit a tier-bonus rule.
 *
 * Bonus shape: (tagId, threshold, initialReward, step, stepReward).
 * RN port of `components/sheets/EditBonusSheet.tsx`. Numeric fields use
 * stepper +/− buttons (no native number keyboard, but cleaner gestures
 * for small ints which is all bonuses use).
 */

import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { BonusConfig, TagId } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const DEFAULTS = {
  threshold: 5,
  initialReward: 1,
  step: 2,
  stepReward: 1,
} as const;

export function EditBonusSheet({
  open,
  onClose,
  bonus,
}: {
  open: boolean;
  onClose: () => void;
  bonus: BonusConfig | null;
}) {
  const theme = useTheme();
  const tags = useStore((s) => s.tags);
  const addBonus = useStore((s) => s.addBonus);
  const updateBonus = useStore((s) => s.updateBonus);
  const removeBonus = useStore((s) => s.removeBonus);

  const isEdit = !!bonus;
  const fallbackTagId = tags[0]?.id ?? "";

  const [tagId, setTagId] = useState<TagId>(fallbackTagId);
  const [threshold, setThreshold] = useState<number>(DEFAULTS.threshold);
  const [initialReward, setInitialReward] = useState<number>(DEFAULTS.initialReward);
  const [step, setStep] = useState<number>(DEFAULTS.step);
  const [stepReward, setStepReward] = useState<number>(DEFAULTS.stepReward);
  const [armDelete, setArmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTagId(bonus?.tagId ?? fallbackTagId);
    setThreshold(bonus?.threshold ?? DEFAULTS.threshold);
    setInitialReward(bonus?.initialReward ?? DEFAULTS.initialReward);
    setStep(bonus?.step ?? DEFAULTS.step);
    setStepReward(bonus?.stepReward ?? DEFAULTS.stepReward);
    setArmDelete(false);
  }, [open, bonus, fallbackTagId]);

  const tagExists = tags.some((t) => t.id === tagId);
  const canSave =
    tagExists && threshold >= 0 && initialReward >= 0 && step >= 0 && stepReward >= 0;

  function save() {
    if (!canSave) return;
    if (isEdit && bonus) {
      updateBonus(bonus.id, { tagId, threshold, initialReward, step, stepReward });
    } else {
      addBonus({ tagId, threshold, initialReward, step, stepReward });
    }
    onClose();
  }

  function handleDelete() {
    if (!bonus) return;
    if (!armDelete) {
      setArmDelete(true);
      return;
    }
    removeBonus(bonus.id);
    onClose();
  }

  const previewTiers: { pomos: number; reward: number }[] = [
    { pomos: threshold, reward: initialReward },
  ];
  if (step > 0) {
    for (let n = 1; n < 4; n++) {
      previewTiers.push({ pomos: threshold + n * step, reward: stepReward });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["88%"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 20, paddingBottom: 16 }}
      >
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            {isEdit ? "EDIT BONUS" : "NEW BONUS"}
          </EditorialText>
          <EditorialText weight="serif" size={26} color={theme.color.ink} style={{ marginTop: 4 }}>
            {isEdit ? "编辑 Bonus" : "新建 Bonus"}
          </EditorialText>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            关联 Tag
          </EditorialText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginTop: 8 }}
          >
            {tags.map((t) => {
              const selected = t.id === tagId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTagId(t.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? "transparent" : theme.color.rule,
                    backgroundColor: selected ? theme.color[t.color] : "transparent",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: selected ? theme.color.paper : theme.color[t.color],
                    }}
                  />
                  <EditorialText
                    weight="sans"
                    size={13}
                    color={selected ? theme.color.paper : theme.color.ink2}
                  >
                    {t.label}
                  </EditorialText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <NumberRow
          label="首次门槛 · 番茄数"
          value={threshold}
          onChange={(v) => setThreshold(Math.max(0, v))}
          step={1}
        />
        <NumberRow
          label="首次奖励 · F"
          value={initialReward}
          onChange={(v) => setInitialReward(Math.max(0, v))}
          step={0.5}
        />
        <NumberRow
          label="阶梯步长 · 番茄数"
          value={step}
          onChange={(v) => setStep(Math.max(0, v))}
          step={1}
          hint="0 = 单次"
        />
        <NumberRow
          label="阶梯奖励 · F"
          value={stepReward}
          onChange={(v) => setStepReward(Math.max(0, v))}
          step={0.5}
        />

        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: theme.color.paper3,
            gap: 6,
          }}
        >
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            预览
          </EditorialText>
          {previewTiers.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <EditorialText weight="mono" size={13} color={theme.color.ink2}>
                {`累计 ${t.pomos} 个`}
              </EditorialText>
              <EditorialText weight="mono" size={13} color={theme.color.tomato}>
                {`+ ${t.reward} F`}
              </EditorialText>
            </View>
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: theme.color.rule,
          }}
        >
          {isEdit ? (
            <Pressable
              onPress={handleDelete}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: armDelete ? theme.color.plum : "transparent",
              }}
            >
              <EditorialText
                weight="sans"
                size={13}
                color={armDelete ? theme.color.paper : theme.color.plum}
              >
                {armDelete ? "再点确认" : "删除"}
              </EditorialText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={{
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: 22,
              backgroundColor: canSave ? theme.color.ink : theme.color.paper3,
              opacity: canSave ? 1 : 0.5,
            }}
          >
            <EditorialText weight="sans" size={14} color={theme.color.paper}>
              保存
            </EditorialText>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <EditorialText weight="sans" size={11} color={theme.color.ink3}>
          {label}
        </EditorialText>
        {hint ? (
          <EditorialText weight="mono" size={10} color={theme.color.inkMute}>
            {hint}
          </EditorialText>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 }}>
        <Pressable
          onPress={() => onChange(value - step)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.color.rule,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <EditorialText weight="serif" size={20} color={theme.color.ink}>
            −
          </EditorialText>
        </Pressable>
        <EditorialText
          weight="mono"
          size={22}
          color={theme.color.ink}
          style={{ minWidth: 60, textAlign: "center" }}
        >
          {Number.isInteger(value) ? String(value) : value.toFixed(1)}
        </EditorialText>
        <Pressable
          onPress={() => onChange(value + step)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.color.rule,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <EditorialText weight="serif" size={20} color={theme.color.ink}>
            ＋
          </EditorialText>
        </Pressable>
      </View>
    </View>
  );
}
