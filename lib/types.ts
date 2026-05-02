// tokmato — shared domain types
// Derived from legacy/tokmato.html state.jsx initialState.

export type TagId = "cs" | "math" | "english" | "others" | "trash";

export interface Tag {
  id: TagId;
  label: string;
  color: string;
  bg: string;
}

export type SessionType = "input" | "output";
export type SessionMode = "running" | "buffer";

export interface PomodoroSession {
  task: string;
  tag: TagId;
  type: SessionType;
  startedAt: number; // ms epoch
  count: number;
  mode: SessionMode;
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
  todayMathPomos: number;
  todayPomos: number;
  todayFGained: number;
  todayHGained: number;
  todayPoolGained: number;

  // Persistent collections
  pomodoroHistory: PomodoroRecord[];
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
