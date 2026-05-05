/**
 * Zod schema for the persisted slice that rides through `saveToCloud`
 * and `loadFromCloud`. This is the trust boundary — anything coming
 * out of an authenticated client is treated as untrusted and parsed
 * here before it reaches Redis.
 *
 * The shape mirrors `partialize` in `lib/store.ts`. Caps on string
 * lengths and array sizes are intentionally generous (≥10× expected)
 * but exist so a tampered client can't blow up the KV tier.
 */

import { z } from "zod";

// ─── Caps ─────────────────────────────────────────────────────────────
// Generous-but-bounded so a malicious client can't dump unbounded
// payloads into a per-user KV slot.
export const MAX_SNAPSHOT_BYTES = 1024 * 1024; // 1 MB — JSON-serialized
                                                // (v1.9 bumped from 256 KB to fit
                                                // a 30-day rolling ledger + rollup
                                                // entries beyond)
const STR_SHORT = 200;
const STR_MED = 500;
const STR_LONG = 2_000;
const ARR_SMALL = 200;
const ARR_MED = 1_000;
const ARR_LARGE = 2_000;

// Tag id is now user-extensible (v6→v7); historical records still hold
// the original 5 string ids ("cs"/"math"/...). Validate as a bounded
// non-empty string so a tampered client can't bloat KV.
const tagId = z.string().min(1).max(STR_SHORT);
const tagColor = z.enum([
  "tomato",
  "sage",
  "teal",
  "gold",
  "plum",
  "ocean",
  "moss",
  "amber",
  "rose",
  "slate",
]);
const sessionType = z.enum(["input", "output"]);
const sessionMode = z.enum(["running", "buffer"]);
const playType = z.enum(["active", "passive"]);

const dayKey = z
  .string()
  .max(STR_SHORT)
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const finiteNumber = z.number().finite();
const nonNegInt = finiteNumber.int().nonnegative();
const safeInt = finiteNumber.int().min(-1_000_000_000).max(1_000_000_000);
const tokenAmount = finiteNumber.min(-1_000_000).max(1_000_000);
const minuteAmount = finiteNumber.min(-100_000).max(100_000);
const epochMs = finiteNumber.int().min(0).max(8_640_000_000_000_000);

const id = z.string().min(1).max(STR_SHORT);

const tagConfig = z.object({
  id: tagId,
  label: z.string().min(1).max(STR_MED),
  color: tagColor,
});

const bonusConfig = z.object({
  id,
  tagId,
  threshold: finiteNumber.min(0).max(10_000),
  initialReward: tokenAmount,
  step: finiteNumber.min(0).max(10_000),
  stepReward: tokenAmount,
});

const pomodoroSession = z.object({
  task: z.string().max(STR_MED),
  tag: tagId,
  type: sessionType,
  startedAt: epochMs,
  // Optional for state migrated from v2; back-fills via store migration.
  phaseStartedAt: epochMs.optional(),
  count: nonNegInt.max(1_000),
  mode: sessionMode,
  notes: z.array(z.string().max(STR_MED)).max(ARR_SMALL),
});

const playSession = z.object({
  type: playType,
  totalMinutes: minuteAmount,
  costMinutes: minuteAmount,
  startedAt: epochMs,
});

const pomodoroRecord = z.object({
  id,
  task: z.string().max(STR_MED),
  tag: tagId,
  type: sessionType,
  count: safeInt,
  minutes: minuteAmount,
  fGained: tokenAmount,
  bonusF: tokenAmount,
  startedAt: epochMs,
  endedAt: epochMs,
  dayKey,
});

const tokenLedgerEntry = z.object({
  id,
  // v1.9: ledger expanded to record every spending action and a daily
  // rollup kind for entries older than the 30-day hot window.
  kind: z.enum([
    "welcome",
    "pomodoro",
    "settle",
    "recharge",
    "food",
    "wish",
    "play",
    "rollup",
  ]),
  fDelta: tokenAmount,
  hDelta: tokenAmount,
  /** Time-pool minute flow. Negative for spend (recharge/play), positive
   *  for refund. Optional — omitted by F/H-only kinds. */
  minutesDelta: minuteAmount.optional(),
  createdAt: epochMs,
  dayKey,
  note: z.string().max(STR_MED).optional(),
  pomodoroRecordId: z.string().max(STR_SHORT).optional(),
  /** Generic reference to a related record (wishId / foodPresetId / etc).
   *  pomodoroRecordId stays as a v1.x dedicated field for back-compat. */
  refId: z.string().max(STR_SHORT).optional(),
});

const wishlistItem = z.object({
  id,
  name: z.string().max(STR_MED),
  price: finiteNumber.min(0).max(10_000_000),
  pay: z.enum(["F", "H", "mixed"]),
  why: z.string().max(STR_LONG),
  progress: finiteNumber.min(0).max(1),
});

const achievementItem = z.object({
  id,
  name: z.string().max(STR_MED),
  price: finiteNumber.min(0).max(10_000_000),
  date: dayKey,
  why: z.string().max(STR_LONG),
});

const kanbanCard = z.object({
  id,
  name: z.string().max(STR_MED),
  next: z.string().max(STR_MED).optional(),
});

const kanbanState = z.object({
  inbox: z.array(kanbanCard).max(ARR_SMALL),
  Q1: z.array(kanbanCard).max(ARR_SMALL),
  Q2: z.array(kanbanCard).max(ARR_SMALL),
  Q3: z.array(kanbanCard).max(ARR_SMALL),
  Q4: z.array(kanbanCard).max(ARR_SMALL),
});

const foodPreset = z.object({
  id,
  name: z.string().max(STR_MED),
  price: finiteNumber.min(0).max(10_000_000),
});

/**
 * Persisted-slice schema. `.strict()` so a tampered client can't smuggle
 * extra keys into Redis. All inner objects are also strict by default
 * with `z.object`.
 */
export const persistedSnapshotSchema = z
  .object({
    ftoken: tokenAmount,
    htoken: tokenAmount,
    timePool: minuteAmount,
    lastSettledDate: dayKey.nullable(),
    activeDay: dayKey,
    session: pomodoroSession.nullable(),
    playSession: playSession.nullable(),
    todayPomos: safeInt,
    /** Per-tag pomodoro counter for the active day. Replaces v1.7
     *  todayMathPomos. Keys are tag ids (strings); values are counts. */
    todayCountsByTag: z.record(tagId, safeInt),
    todayFGained: tokenAmount,
    todayHGained: tokenAmount,
    todayPoolGained: minuteAmount,
    // v1.x stored welcomeGrantedUserIds for per-userId welcome idempotency.
    // v9 moved that idempotency to a per-browser localStorage flag and
    // stops emitting this key. Kept optional so cloud reads from older
    // clients still pass the strict gate.
    welcomeGrantedUserIds: z.array(z.string().max(STR_SHORT)).max(ARR_SMALL).optional(),
    // v1.7 stored guideSeenUserIds; v1.7.1+ moved guide-seen idempotency
    // to a localStorage flag and stops emitting this key. Kept optional
    // so cloud reads from older clients still pass the strict gate.
    guideSeenUserIds: z.array(z.string().max(STR_SHORT)).max(ARR_SMALL).optional(),
    // v1.7 stored todayMathPomos as a fixed slot. v1.8 generalized it to
    // todayCountsByTag — kept optional so cloud reads from older clients
    // still pass strict.
    todayMathPomos: safeInt.optional(),
    /** User-configurable tag list (v1.8+). */
    tags: z.array(tagConfig).max(ARR_SMALL),
    /** User-configurable bonus tier rules (v1.8+). */
    bonuses: z.array(bonusConfig).max(ARR_SMALL),
    lastSavedAt: epochMs,
    pomodoroHistory: z.array(pomodoroRecord).max(ARR_MED),
    tokenHistory: z.array(tokenLedgerEntry).max(ARR_LARGE),
    wishlist: z.array(wishlistItem).max(ARR_SMALL),
    achievements: z.array(achievementItem).max(ARR_MED),
    kanban: kanbanState,
    recentTasks: z.array(z.string().max(STR_MED)).max(ARR_SMALL),
    foodPresets: z.array(foodPreset).max(ARR_SMALL),
  })
  .strict();

export type PersistedSnapshot = z.infer<typeof persistedSnapshotSchema>;
