/**
 * RadialMoveMenu — RN port of `app/kanban/page.tsx:RadialMoveMenu`.
 *
 * Web pulls this off with pointer events on document + an SVG overlay.
 * RN uses a fullscreen Pressable-less <View pointerEvents="box-only">
 * mounted at the layout root. The pan gesture lives in the parent card
 * (LongPressGesture → PanGesture chain), and the parent passes anchor
 * coords + live pointer to this component which only renders the
 * chips + connecting line.
 *
 * Radial layout — chips at 12/3/6/9 o'clock around the anchor:
 *   top    → Q1 (red)
 *   right  → Q2 (sage)
 *   bottom → Q3 (plum)
 *   left   → Q4 (gold)
 *   center → Inbox (only if the card isn't already there)
 *
 * Hit detection: angle bucketing into 4 quadrants once `mag > DEAD_ZONE`.
 * Same algorithm as the web original.
 */

import { View, Dimensions } from "react-native";
import Svg, { Line, Circle } from "react-native-svg";
import type { KanbanColumnId } from "@tokmato/shared/types";
import { EditorialText } from "./EditorialText";
import { useTheme } from "../lib/use-theme";

export const RADIUS = 100;
export const DEAD_ZONE = 28;
const CHIP_HALF = 44;
const EDGE_PAD_X = RADIUS + CHIP_HALF;
const EDGE_PAD_TOP = RADIUS + 30;
const EDGE_PAD_BOTTOM = RADIUS + 60;

const CHIP_LABELS: Record<KanbanColumnId, string> = {
  inbox: "Inbox",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
};

export function clampAnchor(
  anchor: { x: number; y: number },
): { x: number; y: number } {
  const { width: vw, height: vh } = Dimensions.get("window");
  return {
    x: Math.max(EDGE_PAD_X, Math.min(vw - EDGE_PAD_X, anchor.x)),
    y: Math.max(EDGE_PAD_TOP, Math.min(vh - EDGE_PAD_BOTTOM, anchor.y)),
  };
}

/**
 * Pure routing helper — given anchor + pointer + the card's current
 * column, returns which target should highlight (or null if the
 * pointer is dead-center over a card already in inbox, etc).
 *
 * Used by the parent's PanGesture onUpdate via `runOnJS`.
 */
export function pointerToTarget(
  anchor: { x: number; y: number },
  pointer: { x: number; y: number },
  fromCol: KanbanColumnId,
): KanbanColumnId | null {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const mag = Math.hypot(dx, dy);
  if (mag < DEAD_ZONE) {
    return fromCol === "inbox" ? null : "inbox";
  }
  const angle = Math.atan2(dy, dx);
  let target: KanbanColumnId;
  if (angle > (-3 * Math.PI) / 4 && angle < -Math.PI / 4) target = "Q1";
  else if (angle >= -Math.PI / 4 && angle < Math.PI / 4) target = "Q2";
  else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) target = "Q3";
  else target = "Q4";
  return target === fromCol ? null : target;
}

export function RadialMoveMenu({
  anchor,
  pointer,
  active,
  fromCol,
}: {
  anchor: { x: number; y: number };
  pointer: { x: number; y: number };
  active: KanbanColumnId | null;
  fromCol: KanbanColumnId;
}) {
  const theme = useTheme();
  const a = clampAnchor(anchor);

  const chipSpec: { id: KanbanColumnId; pos: { x: number; y: number }; color: string }[] = [
    { id: "Q1", pos: { x: a.x, y: a.y - RADIUS }, color: theme.color.tomato },
    { id: "Q2", pos: { x: a.x + RADIUS, y: a.y }, color: theme.color.sage },
    { id: "Q3", pos: { x: a.x, y: a.y + RADIUS }, color: theme.color.plum },
    { id: "Q4", pos: { x: a.x - RADIUS, y: a.y }, color: theme.color.gold },
  ];

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.25)",
      }}
    >
      <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <Line
          x1={a.x}
          y1={a.y}
          x2={pointer.x}
          y2={pointer.y}
          stroke={theme.color.ink}
          strokeWidth={2}
          strokeOpacity={0.6}
          strokeDasharray="4 4"
        />
        <Circle
          cx={pointer.x}
          cy={pointer.y}
          r={6}
          fill={theme.color.ink}
        />
      </Svg>

      {fromCol !== "inbox" ? (
        <Chip
          id="inbox"
          x={a.x}
          y={a.y}
          color={theme.color.inkMute}
          isActive={active === "inbox"}
          smaller
        />
      ) : null}
      {chipSpec.map((c) => (
        <Chip
          key={c.id}
          id={c.id}
          x={c.pos.x}
          y={c.pos.y}
          color={c.color}
          isActive={active === c.id}
        />
      ))}
    </View>
  );
}

function Chip({
  id,
  x,
  y,
  color,
  isActive,
  smaller,
}: {
  id: KanbanColumnId;
  x: number;
  y: number;
  color: string;
  isActive: boolean;
  smaller?: boolean;
}) {
  const theme = useTheme();
  const w = smaller ? 60 : 76;
  const h = smaller ? 28 : 36;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: h / 2,
        backgroundColor: isActive ? color : theme.color.paper,
        borderWidth: 1.5,
        borderColor: isActive ? color : theme.color.rule,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "rgba(0,0,0,0.2)",
        shadowOpacity: isActive ? 0.4 : 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: isActive ? 6 : 3,
      }}
    >
      <EditorialText
        weight="sans"
        size={smaller ? 10 : 12}
        color={isActive ? theme.color.paper : theme.color.ink2}
      >
        {CHIP_LABELS[id]}
      </EditorialText>
    </View>
  );
}
