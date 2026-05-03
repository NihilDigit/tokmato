// tokmato — shared domain types
// Derived from legacy/tokmato.html state.jsx initialState.

/** Tag id is now user-extensible. Stored as a string for forward compat
 *  (history records keep their original id even if a tag is later deleted
 *  or renamed). The alias is documentation-only — no branded type. */
export type TagId = string;

/** Fixed 10-color palette for tag chips. Stored as a token; the runtime
 *  mapping to bg/text Tailwind classes lives in `lib/tag-colors.ts`. */
export const TAG_COLORS = [
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
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** User-configurable tag definition. `id` is immutable (referenced by
 *  pomodoroHistory, tokenHistory, BonusConfig). `label` and `color` can
 *  be edited freely. */
export interface TagConfig {
  id: TagId;
  label: string;
  color: TagColor;
}

/** A single bonus rule attached to one tag. Tier ladder is open-ended:
 *  - tier 0 fires at `threshold` pomodoros, awarding `initialReward` F.
 *  - tier n>=1 fires at `threshold + n*step` pomos, awarding `stepReward` F.
 *  No upper cap — extrapolated infinitely. */
export interface BonusConfig {
  id: string;
  tagId: TagId;
  threshold: number;
  initialReward: number;
  step: number;
  stepReward: number;
}

export type SessionType = "input" | "output";
export type SessionMode = "running" | "buffer";

export interface PomodoroSession {
  task: string;
  tag: TagId;
  type: SessionType;
  startedAt: number;       // ms epoch — session start (immutable)
  phaseStartedAt: number;  // ms epoch — current phase (running/buffer) start
  count: number;           // 1-based current pomodoro number
  mode: SessionMode;       // current phase
  notes: string[];
}

export interface PomodoroRecord {
  id: string;
  task: string;
  tag: TagId;
  type: SessionType;
  count: number;
  minutes: number;
  fGained: number;
  bonusF: number;
  startedAt: number;
  endedAt: number;
  dayKey: string;
}

export interface TokenLedgerEntry {
  id: string;
  kind: "welcome" | "pomodoro" | "settle";
  fDelta: number;
  hDelta: number;
  createdAt: number;
  dayKey: string;
  note?: string;
  pomodoroRecordId?: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  price: number; // ¥
  pay: "F" | "H" | "mixed";
  why: string;
  progress: number; // 0..1
}

export interface AchievementItem {
  id: string;
  name: string;
  price: number;
  date: string; // YYYY-MM-DD
  why: string;
}

export interface KanbanCard {
  id: string;
  name: string;
  next?: string;
}

export type KanbanColumnId = "inbox" | "Q1" | "Q2" | "Q3" | "Q4";

export interface KanbanState {
  inbox: KanbanCard[];
  Q1: KanbanCard[];
  Q2: KanbanCard[];
  Q3: KanbanCard[];
  Q4: KanbanCard[];
}

export interface FoodPreset {
  id: string;
  name: string;
  price: number;
}

export interface UserState {
  // Token balances
  ftoken: number;
  htoken: number;
  timePool: number; // minutes

  // Settlement
  lastSettledDate: string | null; // YYYY-MM-DD (UTC+8, with 4am cutoff)
  activeDay: string; // current tokmato day for daily counters

  // Current sessions
  session: PomodoroSession | null;
  playSession: PlaySession | null;

  // Today snapshot
  todayPomos: number;
  /** Per-tag pomodoro count for the active day. Replaces the v6
   *  `todayMathPomos` slot — generalized so any bonus-bearing tag has
   *  its running count tracked. Reset by `normalizeDay` on day-roll.
   *  Tags with zero today are simply absent from the record. */
  todayCountsByTag: Record<TagId, number>;
  todayFGained: number;
  todayHGained: number;
  todayPoolGained: number;
  welcomeGrantedUserIds: string[];

  // Configurable rules
  tags: TagConfig[];
  bonuses: BonusConfig[];

  /**
   * Local clock value of the most recent successful saveToCloud (or the
   * cloud `savedAt` we last loaded). Drives LWW: on app open we only
   * overwrite local with cloud when `cloud.savedAt > local.lastSavedAt`.
   * 0 means "never synced from this device".
   */
  lastSavedAt: number;

  // Persistent collections
  pomodoroHistory: PomodoroRecord[];
  tokenHistory: TokenLedgerEntry[];
  wishlist: WishlistItem[];
  achievements: AchievementItem[];
  kanban: KanbanState;
  recentTasks: string[];
  foodPresets: FoodPreset[];
}

// Entertainment session — same shape as PomodoroSession but for play.
export type PlayType = "active" | "passive";
export interface PlaySession {
  type: PlayType;
  totalMinutes: number; // visible timer duration
  costMinutes: number; // time-pool minutes deducted up front
  startedAt: number;    // ms epoch
}

// UI-only state (not persisted to KV)
export type Theme = "auto" | "light" | "dark";
export type TabId = "home" | "journey" | "redeem" | "kanban" | "settings";
export type SheetId =
  | null
  | "start"
  | "pool"
  | "play"
  | "food"
  | "settle"
  | "notes";
