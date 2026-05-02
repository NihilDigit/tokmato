import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Journey — 年度回顾
// 信息密度：标题 + 5 stats + heatmap (52×7) + 学科分布 + 最近 20 串
// 全部 Server Component；mock 数据 deterministic seed
// ─────────────────────────────────────────────────────────────────────────

type TagId = "all" | "cs" | "math" | "english" | "others" | "trash";

const TAGS: { id: TagId; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "cs", label: "#cs" },
  { id: "math", label: "#math" },
  { id: "english", label: "#english" },
  { id: "others", label: "#others" },
  { id: "trash", label: "#trash" },
];

// Each tag → 5-step opacity ladder mapped to a token. Cell `0` is the
// neutral empty state (uses `--ink` 5%); `4` is the saturated end.
const HEATMAP_OPACITY = [5, 18, 40, 65, 95] as const;
const HEATMAP_TONE: Record<TagId, string> = {
  all: "bg-tomato",
  math: "bg-tomato",
  cs: "bg-ink",
  english: "bg-sage",
  others: "bg-gold",
  trash: "bg-plum",
};

const TAG_BAR: Record<Exclude<TagId, "all">, string> = {
  cs: "bg-ink",
  math: "bg-tomato",
  english: "bg-sage",
  others: "bg-gold",
  trash: "bg-plum",
};

const TAG_CHIP: Record<Exclude<TagId, "all">, string> = {
  cs: "bg-paper-2 text-ink",
  math: "bg-tomato text-white",
  english: "bg-sage text-white",
  others: "bg-gold-soft text-ink",
  trash: "bg-plum text-white",
};

const TAG_LABEL: Record<Exclude<TagId, "all">, string> = {
  cs: "#cs",
  math: "#math",
  english: "#english",
  others: "#others",
  trash: "#trash",
};

export default function JourneyPage() {
  // Past 30 days (rolling) — not the calendar month, so today is always day 30.
  const stats = {
    totalPomos: 158,
    totalHours: 65.8,
    totalF: 124,
    totalH: 78,
    longestStreak: 14,
  };

  // Tag distribution (sums to 100)
  const distribution: { tag: Exclude<TagId, "all">; pct: number }[] = [
    { tag: "math", pct: 38 },
    { tag: "cs", pct: 27 },
    { tag: "english", pct: 18 },
    { tag: "others", pct: 12 },
    { tag: "trash", pct: 5 },
  ];

  const recentStrings: {
    task: string;
    tag: Exclude<TagId, "all">;
    count: number;
    mins: number;
    date: string;
  }[] = [
    { task: "线代第 3 章错题", tag: "math", count: 6, mins: 142, date: "今天 14:00" },
    { task: "debug dataloader", tag: "cs", count: 3, mins: 76, date: "今天 10:30" },
    { task: "英语阅读 2018", tag: "english", count: 4, mins: 100, date: "昨天 19:20" },
    { task: "精读 Transformer paper", tag: "cs", count: 8, mins: 198, date: "昨天 13:00" },
    { task: "vibe coding tomato", tag: "others", count: 5, mins: 124, date: "前天 21:00" },
    { task: "政治马原", tag: "trash", count: 2, mins: 50, date: "前天 09:00" },
    { task: "高数极限专题", tag: "math", count: 5, mins: 124, date: "5/12 16:00" },
    { task: "pytorch 自定义 dataset", tag: "cs", count: 4, mins: 98, date: "5/11 10:00" },
    { task: "英语作文模板背诵", tag: "english", count: 3, mins: 72, date: "5/10 21:30" },
    { task: "概率论第 4 章", tag: "math", count: 7, mins: 168, date: "5/10 14:00" },
    { task: "vim 配置整理", tag: "others", count: 2, mins: 48, date: "5/9 22:00" },
    { task: "CUDA 入门 lecture 2", tag: "cs", count: 6, mins: 152, date: "5/9 13:00" },
    { task: "微积分中值定理", tag: "math", count: 4, mins: 98, date: "5/8 15:00" },
    { task: "英语听力慢速 VOA", tag: "english", count: 2, mins: 50, date: "5/8 09:00" },
    { task: "Linux 内核 chap 3", tag: "cs", count: 5, mins: 122, date: "5/7 14:00" },
    { task: "马原刷题", tag: "trash", count: 3, mins: 70, date: "5/7 19:00" },
    { task: "线代第 2 章习题", tag: "math", count: 6, mins: 144, date: "5/6 14:30" },
    { task: "Transformer 实现 forward", tag: "cs", count: 9, mins: 220, date: "5/5 10:00" },
    { task: "英语精读 economist", tag: "english", count: 3, mins: 76, date: "5/4 20:00" },
    { task: "高数不定积分", tag: "math", count: 5, mins: 122, date: "5/4 14:00" },
  ];

  const activeTag: TagId = "all";

  return (
    <main className="flex flex-col gap-10">
      {/* Editorial title — h2 cap, single tomato accent on the number */}
      <header className="flex flex-col gap-2">
        <div className="smallcaps">过去 30 天</div>
        <h1 className="serif italic text-h2 leading-tight text-ink">
          你做了 <span className="text-tomato">{stats.totalPomos.toLocaleString()}</span> 个番茄。
        </h1>
      </header>

      {/* 5 stats — hairline-divided. 2 cols mobile, 5 cols ≥ md */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-5">
        <BalanceCell kicker="番茄" value={stats.totalPomos.toLocaleString()} />
        <BalanceCell kicker="学习" value={stats.totalHours.toFixed(1)} unit="h" />
        <BalanceCell
          kicker="FToken"
          value={stats.totalF.toLocaleString()}
          unit="◆"
          color="text-tomato"
        />
        <BalanceCell
          kicker="HToken"
          value={stats.totalH.toLocaleString()}
          unit="❖"
          color="text-sage"
        />
        <BalanceCell
          kicker="最长连续学习"
          value={stats.longestStreak}
          unit="天"
        />
      </section>

      {/* Heatmap (left 50%) + Donut (right 50%) — single visual section */}
      <section className="flex flex-col gap-4">
        <SectionHead title="30 天的痕迹" />

        {/* Tag filter row — drives heatmap tone (placeholder: active=all) */}
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => {
            const active = t.id === activeTag;
            return (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  t.id !== "all" && "font-mono",
                  active
                    ? "border-transparent bg-ink text-paper"
                    : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Left: heatmap */}
          <div className="rounded-xl border border-rule bg-paper p-5">
            <Heatmap tag={activeTag} />
            <div className="mono mt-3.5 flex items-center justify-between text-[11px] text-ink-mute">
              <span>30 天前</span>
              <div className="flex items-center gap-1.5">
                <span>少</span>
                {HEATMAP_OPACITY.map((op, i) => (
                  <span
                    key={i}
                    className={cn("h-2.5 w-2.5 rounded-[2px]", HEATMAP_TONE[activeTag])}
                    style={{ opacity: op / 100 }}
                  />
                ))}
                <span>多</span>
              </div>
              <span>今天</span>
            </div>
          </div>

          {/* Right: donut distribution */}
          <div className="flex items-center gap-6 rounded-xl border border-rule bg-paper p-5">
            <Donut data={distribution} />
            <ul className="flex flex-col gap-2.5">
              {distribution.map((d) => (
                <li key={d.tag} className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-[2px]", TAG_BAR[d.tag])} aria-hidden />
                  <span className="mono text-xs text-ink-3">{TAG_LABEL[d.tag]}</span>
                  <span className="serif text-base leading-none text-ink">
                    {d.pct}
                    <span className="ml-0.5 text-[11px] text-ink-3">%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Recent strings */}
      <section className="flex flex-col gap-4">
        <SectionHead
          kicker="最近番茄串 · 仅显示 20 条"
          title="脚印"
          right={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-1.5 text-[13px] text-ink-2 transition hover:border-ink/30 hover:text-ink"
            >
              <Download size={13} />
              导出 JSON
            </button>
          }
        />

        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="max-h-[520px] overflow-y-auto">
            {recentStrings.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 sm:gap-6 sm:px-6",
                  i > 0 && "border-t border-rule"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "mono inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px]",
                      TAG_CHIP[r.tag]
                    )}
                  >
                    {TAG_LABEL[r.tag]}
                  </span>
                  <span className="serif truncate text-base text-ink sm:text-[17px]">
                    {r.task}
                  </span>
                </div>
                <span className="mono text-[13px] text-ink-3">{r.count} 番</span>
                <span className="mono text-[13px] text-ink-3">{r.mins}m</span>
                <span className="min-w-[70px] text-right text-xs text-ink-mute sm:min-w-[80px]">
                  {r.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// In-file primitives
// ─────────────────────────────────────────────────────────────────────────

function BalanceCell({
  kicker,
  value,
  unit,
  color,
}: {
  kicker: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  // tailwind-merge groups `text-stat` (font-size token) and `text-tomato`
  // (color token) under the same `text-*` family and dedupes one of them.
  // Bypass cn() here so the size utility survives next to the color utility.
  const valueClass = `serif text-stat leading-none${color ? " " + color : ""}`;
  const kickerClass = `smallcaps${color ? " " + color : ""}`;
  return (
    <div className="flex flex-col gap-1.5 bg-paper p-5">
      <div className={kickerClass}>{kicker}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={valueClass}>{value}</span>
        {unit && <span className="text-[13px] text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

function SectionHead({
  kicker,
  title,
  right,
}: {
  kicker?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <div className="smallcaps mb-1.5">{kicker}</div>}
        <h2 className="serif italic text-h3 leading-tight text-ink">{title}</h2>
      </div>
      {right}
    </div>
  );
}

// Donut chart — token-driven slices, CSS-var-as-fill via inline style.
const TAG_FILL: Record<Exclude<TagId, "all">, string> = {
  cs: "var(--ink)",
  math: "var(--tomato)",
  english: "var(--sage)",
  others: "var(--gold)",
  trash: "var(--plum)",
};

function Donut({
  data,
  size = 140,
  thickness = 24,
}: {
  data: { tag: Exclude<TagId, "all">; pct: number }[];
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = data.reduce((acc, d) => acc + d.pct, 0) || 1;

  let start = -Math.PI / 2; // start at 12 o'clock
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {data.map((d) => {
        const angle = (d.pct / total) * Math.PI * 2;
        const end = start + angle;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const large = angle > Math.PI ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        const slice = (
          <path
            key={d.tag}
            d={path}
            fill={TAG_FILL[d.tag]}
            stroke="var(--paper)"
            strokeWidth="1"
          />
        );
        start = end;
        return slice;
      })}
      {/* Donut hole */}
      <circle cx={cx} cy={cy} r={r - thickness / 2} fill="var(--paper)" />
    </svg>
  );
}

// Heatmap — past 30 days as a 3 rows × 10 cols grid of small squares.
// Reading order = time order: top-left = 29 days ago, bottom-right = today.
// Colors flow through HEATMAP_TONE + opacity ladder. Each cell shows a
// native browser tooltip on hover.
function Heatmap({ tag }: { tag: TagId }) {
  const ROWS = 3;
  const COLS = 10;
  const TOTAL = ROWS * COLS; // 30
  const tone = HEATMAP_TONE[tag];

  const seed = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  const rng = (i: number, t: string) => (seed(`${i}-${t}`) % 1000) / 1000;

  const today = new Date();

  return (
    <div
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: TOTAL }).map((_, i) => {
        // i = 0 → 29 days ago (top-left); i = 29 → today (bottom-right)
        const dayIndex = TOTAL - 1 - i;
        const r = rng(dayIndex, tag);
        const recency = 0.55 + ((30 - dayIndex) / 30) * 0.45;
        const v = r * recency;
        const level =
          v > 0.78 ? 4 : v > 0.55 ? 3 : v > 0.3 ? 2 : v > 0.1 ? 1 : 0;
        const isEmpty = level === 0;

        const date = new Date(today.getTime() - dayIndex * 86400000);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}/${mm}/${dd}`;
        const pomos = isEmpty ? 0 : Math.max(1, Math.round(v * 8));

        return (
          <div
            key={i}
            title={`${dateStr} · ${pomos} 个番茄`}
            className={cn(
              "aspect-square cursor-help rounded-[2px]",
              isEmpty ? "bg-ink" : tone
            )}
            style={{ opacity: HEATMAP_OPACITY[level] / 100 }}
          />
        );
      })}
    </div>
  );
}
