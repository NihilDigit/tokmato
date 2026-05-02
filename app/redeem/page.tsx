"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PoolSheet } from "@/components/sheets/PoolSheet";
import { PlaySheet } from "@/components/sheets/PlaySheet";
import { FoodSheet } from "@/components/sheets/FoodSheet";
import { WishRedeemSheet } from "@/components/sheets/WishRedeemSheet";
import { AddWishSheet } from "@/components/sheets/AddWishSheet";
import { useStore } from "@/lib/store";

type Pay = "F" | "H" | "mixed";
type Wish = { id: string; name: string; price: number; pay: Pay; why: string; progress: number };
type Achievement = { id: string; name: string; price: number; date: string; why: string };

export default function RedeemPage() {
  // Live state from store
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const wishlist = useStore((s) => s.wishlist) as Wish[];
  const achievements = useStore((s) => s.achievements) as Achievement[];
  const recharge = useStore((s) => s.recharge);
  const startPlay = useStore((s) => s.startPlay);
  const spendFood = useStore((s) => s.spendFood);
  const redeemWish = useStore((s) => s.redeemWish);
  const addWish = useStore((s) => s.addWish);
  const removeWish = useStore((s) => s.removeWish);

  const fYuan = ftoken * 5;
  const hYuan = htoken * 10;
  const totalYuan = fYuan + hYuan;

  const [openPool, setOpenPool] = useState(false);
  const [openPlay, setOpenPlay] = useState(false);
  const [openFood, setOpenFood] = useState(false);
  const [openAddWish, setOpenAddWish] = useState(false);
  const [redeemWishId, setRedeemWishId] = useState<string | null>(null);
  const activeWish = redeemWishId
    ? wishlist.find((w) => w.id === redeemWishId) ?? null
    : null;

  return (
    <main className="flex flex-col gap-6">
      {/* Hero — balance card with WaterPool */}
      <section className="rounded-xl border border-rule bg-paper-2/50 p-6 sm:p-8">
        <h1 className="serif italic text-h2 leading-tight">兑现</h1>

        <div className="mt-6 grid grid-cols-1 items-stretch gap-6 md:grid-cols-[1fr_auto]">
          {/* Left: F + H balance + ¥ total */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-rule bg-paper">
              <BalanceCell kicker="FToken" value={ftoken} unit={`F · ¥${fYuan.toFixed(0)}`} color="text-tomato" />
              <BalanceCell kicker="HToken" value={htoken} unit={`H · ¥${hYuan.toFixed(0)}`} color="text-sage-deep" border />
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="smallcaps">共可花</span>
              <span className="serif italic text-balance-num leading-none tracking-tight text-ink">
                ¥{totalYuan.toFixed(0)}
              </span>
            </div>
          </div>

          {/* Right: time pool circle */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <WaterPool value={timePool} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="serif italic text-[56px] leading-none tracking-tight text-ink">
                  {timePool}
                </div>
                <div className="mono mt-1 text-[10px] tracking-[0.15em] text-ink-3">MIN</div>
              </div>
              <button
                title="充值时间池"
                onClick={() => setOpenPool(true)}
                className="absolute -top-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-full border border-rule bg-paper text-teal-deep shadow-soft transition hover:border-teal-deep/40"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="smallcaps text-teal-deep">时间池</div>
          </div>
        </div>
      </section>

      {/* Small spend pair — 启动娱乐 / 食物饮料 */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SpendCard
          icon={<GamepadIcon />}
          title="玩点什么"
          sub="消费时间池"
          accent="text-teal-deep"
          tint="bg-teal-soft/30"
          onClick={() => setOpenPlay(true)}
        />
        <SpendCard
          icon={<CupIcon />}
          title="吃点好的"
          sub="消费 HToken"
          accent="text-sage-deep"
          tint="bg-sage-soft/30"
          onClick={() => setOpenFood(true)}
        />
      </section>

      {/* Wishlist grid */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="serif italic text-h3 leading-tight">清单</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {wishlist.map((w) => (
            <WishCard
              key={w.id}
              item={w}
              ftoken={ftoken}
              htoken={htoken}
              onClick={() => setRedeemWishId(w.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => setOpenAddWish(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-rule p-7 text-ink-3 transition hover:border-tomato/40 hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={wishlist.length >= 5}
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-[13px]">
              {wishlist.length >= 5 ? "已满 5 项" : "添加新愿望"}
            </span>
          </button>
        </div>
      </section>

      {/* Achievement wall */}
      <section className="flex flex-col gap-4">
        <h2 className="serif italic text-h3 leading-tight">赢回来的东西</h2>
        {achievements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule px-5 py-6 text-center text-[13px] text-ink-3">
            买了什么写在这里
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {achievements.map((a) => (
              <AchievementCard key={a.id} item={a} />
            ))}
          </div>
        )}
      </section>

      {/* Sheets */}
      <PoolSheet
        open={openPool}
        onOpenChange={setOpenPool}
        ftoken={ftoken}
        htoken={htoken}
        timePool={timePool}
        onConfirm={(d) => {
          recharge(d);
          setOpenPool(false);
        }}
      />
      <PlaySheet
        open={openPlay}
        onOpenChange={setOpenPlay}
        timePool={timePool}
        onConfirm={(d) => {
          startPlay(d);
          setOpenPlay(false);
        }}
      />
      <FoodSheet
        open={openFood}
        onOpenChange={setOpenFood}
        htoken={htoken}
        onConfirm={(d) => {
          spendFood(d);
          setOpenFood(false);
        }}
      />
      <WishRedeemSheet
        open={!!activeWish}
        onOpenChange={(v) => {
          if (!v) setRedeemWishId(null);
        }}
        wish={activeWish}
        ftoken={ftoken}
        htoken={htoken}
        onConfirm={(d) => {
          redeemWish(d);
          setRedeemWishId(null);
        }}
        onRemove={(id) => {
          removeWish(id);
          setRedeemWishId(null);
        }}
      />
      <AddWishSheet
        open={openAddWish}
        onOpenChange={setOpenAddWish}
        onConfirm={(d) => {
          addWish(d);
          setOpenAddWish(false);
        }}
      />
    </main>
  );
}

// ── BalanceCell ────────────────────────────────────────────────────────────
function BalanceCell({
  kicker,
  value,
  unit,
  color,
  border,
}: {
  kicker: string;
  value: number;
  unit: string;
  color: string;
  border?: boolean;
}) {
  return (
    <div className={`flex min-h-[110px] flex-col gap-3 p-5 ${border ? "border-l border-rule" : ""}`}>
      <div className={`smallcaps ${color}`}>{kicker}</div>
      <div className="flex items-baseline gap-2">
        <span className={`serif text-stat leading-none tracking-tight ${color}`}>
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </span>
        <span className="text-xs text-ink-3">{unit}</span>
      </div>
    </div>
  );
}

// ── SpendCard ──────────────────────────────────────────────────────────────
function SpendCard({
  icon,
  title,
  sub,
  accent,
  tint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  accent: string;
  tint: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-4 rounded-xl border border-rule ${tint} p-5 text-left transition hover:-translate-y-px hover:shadow-soft`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center ${accent}`}>{icon}</span>
      <div className="flex-1">
        <div className={`serif text-lg leading-snug ${accent}`}>{title}</div>
        <div className="mt-0.5 text-xs text-ink-3">{sub}</div>
      </div>
      <span className={`mono text-base ${accent} transition group-hover:translate-x-0.5`}>→</span>
    </button>
  );
}

// ── WishCard ───────────────────────────────────────────────────────────────
function WishCard({
  item,
  ftoken,
  htoken,
  onClick,
}: {
  item: Wish;
  ftoken: number;
  htoken: number;
  onClick?: () => void;
}) {
  const tokenForPay =
    item.pay === "F"
      ? `${(item.price / 5).toFixed(1)} F`
      : item.pay === "H"
        ? `${(item.price / 10).toFixed(1)} H`
        : `${(item.price / 7).toFixed(1)} F + H`;

  // Real progress: how much of `price` the user can currently afford
  // given their balances. The wish.progress field is now a fallback only.
  const fYuan = ftoken * 5;
  const hYuan = htoken * 10;
  const affordable = item.pay === "F" ? fYuan : item.pay === "H" ? hYuan : fYuan + hYuan;
  const progress = Math.min(1, affordable / item.price);
  const pct = Math.round(progress * 100);
  const remaining = Math.max(0, Math.round(item.price - affordable));

  const tagBg = item.pay === "F" ? "bg-tomato-soft text-tomato-deep" : item.pay === "H" ? "bg-sage-soft text-sage-deep" : "bg-gold-soft text-ink";
  const tagLabel = item.pay === "F" ? "FToken" : item.pay === "H" ? "HToken" : "混合";
  const barFill =
    item.pay === "F"
      ? "bg-tomato"
      : item.pay === "H"
        ? "bg-sage"
        : "bg-gradient-to-r from-tomato to-sage";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3.5 rounded-xl border border-rule bg-paper p-5 text-left transition hover:-translate-y-px hover:border-ink/25 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="serif text-lg leading-snug">{item.name}</div>
          <div className="mt-1 mono text-xs text-ink-3">¥{item.price} · {tokenForPay}</div>
        </div>
        <span className={`mono rounded-full px-2.5 py-0.5 text-[10px] tracking-wide ${tagBg}`}>
          {tagLabel}
        </span>
      </div>

      <p className="m-0 text-[13px] leading-relaxed text-ink-2">{item.why}</p>

      <div>
        <div className="mono mb-1 flex justify-between text-[10px] text-ink-3">
          <span>{pct}%</span>
          <span>{remaining > 0 ? `还差 ¥${remaining}` : "可兑现"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-sm bg-ink/[0.06]">
          <div
            className={`h-full ${barFill}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </button>
  );
}

// ── AchievementCard ────────────────────────────────────────────────────────
const ACH_GLYPHS = ["📚", "🎫", "🎧", "🪑", "🖋"];

function AchievementCard({ item }: { item: Achievement }) {
  const glyph = ACH_GLYPHS[item.id.charCodeAt(item.id.length - 1) % ACH_GLYPHS.length];
  return (
    <div className="relative flex flex-col gap-2 rounded-xl border border-rule bg-gradient-to-b from-gold-soft/40 to-paper p-4">
      <span className="mono absolute right-2.5 top-2.5 rounded-full bg-ink px-2 py-0.5 text-[9px] tracking-wide text-paper">
        已兑换
      </span>
      <div className="mt-1 text-[26px] leading-none">{glyph}</div>
      <div className="serif text-base leading-snug">{item.name}</div>
      <div className="mono text-[10px] text-ink-3">¥{item.price} · {item.date}</div>
      <div className="border-t border-rule pt-2 text-[12px] leading-relaxed text-ink-2">
        {item.why}
      </div>
    </div>
  );
}

// ── WaterPool ──────────────────────────────────────────────────────────────
// Pure RSC — uses CSS keyframe `translateX` on two pre-baked sine paths to
// simulate the legacy double-wave animation. No useState / useEffect needed.
const POOL_SIZE = 200;

function WaterPool({ value, max = 480 }: { value: number; max?: number }) {
  const fillPct = Math.min(1, Math.max(0, value / max));
  const r = POOL_SIZE / 2;
  const surfaceY = POOL_SIZE - fillPct * POOL_SIZE;
  const waveAmp = 3 + fillPct * 2;

  // Build a sine-wave path that tiles 2x horizontally so we can translate by
  // -POOL_SIZE without showing a seam.
  const samples = 80;
  const span = POOL_SIZE * 2;

  const buildWave = (freq: number, amp: number, phaseShift: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= samples * 2; i++) {
      const x = (span * i) / (samples * 2);
      const y = surfaceY + Math.sin((i / samples) * Math.PI * 2 * freq + phaseShift) * amp;
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return `M -${POOL_SIZE},${POOL_SIZE} L 0,${POOL_SIZE} L ${pts[0]} ` +
      pts.slice(1).map((p) => `L ${p}`).join(" ") +
      ` L ${span},${POOL_SIZE} Z`;
  };

  const wavePathA = buildWave(1.4, waveAmp, 0);
  const wavePathB = buildWave(2.3, waveAmp * 0.55, Math.PI / 3);

  return (
    <>
      <style>{`
        @keyframes tk-wave-a { from { transform: translateX(0); } to { transform: translateX(-${POOL_SIZE}px); } }
        @keyframes tk-wave-b { from { transform: translateX(0); } to { transform: translateX(-${POOL_SIZE}px); } }
        .tk-wave-a { animation: tk-wave-a 3.2s linear infinite; transform-origin: 0 0; }
        .tk-wave-b { animation: tk-wave-b 4.7s linear infinite; transform-origin: 0 0; }
        @media (prefers-reduced-motion: reduce) {
          .tk-wave-a, .tk-wave-b { animation: none; }
        }
      `}</style>
      <svg
        width={POOL_SIZE}
        height={POOL_SIZE}
        viewBox={`0 0 ${POOL_SIZE} ${POOL_SIZE}`}
        className="block"
        aria-label={`时间池 ${value} 分钟`}
        role="img"
      >
        <defs>
          <clipPath id="tk-pool-clip">
            <circle cx={r} cy={r} r={r - 1} />
          </clipPath>
          <linearGradient id="tk-pool-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--teal-deep)" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="tk-pool-glass" cx="0.32" cy="0.28" r="0.85">
            <stop offset="0%" stopColor="var(--glass-highlight-55)" />
            <stop offset="55%" stopColor="var(--pool-glass-mid)" />
            <stop offset="100%" stopColor="var(--glass-shadow)" />
          </radialGradient>
        </defs>

        {/* glass body */}
        <circle cx={r} cy={r} r={r - 1} fill="url(#tk-pool-glass)" />

        {/* water clipped to circle — two waves translating left for the loop */}
        <g clipPath="url(#tk-pool-clip)">
          <path d={wavePathA} fill="url(#tk-pool-water)" className="tk-wave-a" />
          <path d={wavePathB} fill="var(--teal)" opacity="0.28" className="tk-wave-b" />
          {/* fill ticks every 25% */}
          {[0.25, 0.5, 0.75].map((t, i) => (
            <line
              key={i}
              x1={r - (r - 8) * Math.sin(Math.acos(1 - 2 * t))}
              x2={r - (r - 14) * Math.sin(Math.acos(1 - 2 * t))}
              y1={POOL_SIZE - t * POOL_SIZE}
              y2={POOL_SIZE - t * POOL_SIZE}
              stroke="var(--glass-highlight-55)"
              strokeWidth="0.8"
            />
          ))}
        </g>

        {/* outer ring */}
        <circle cx={r} cy={r} r={r - 1} fill="none" stroke="var(--ink-3)" strokeWidth="1" opacity="0.55" />

        {/* highlight crescent */}
        <path
          d={`M ${r - r * 0.55} ${r * 0.45} A ${r * 0.85} ${r * 0.85} 0 0 1 ${r * 0.55} ${r - r * 0.55}`}
          fill="none"
          stroke="var(--glass-highlight-70)"
          strokeWidth="1.4"
          opacity="0.55"
        />
      </svg>
    </>
  );
}

// ── Inline SVG icons (legacy paths, currentColor) ──────────────────────────
function GamepadIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 34 34"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11 H25 A6 6 0 0 1 31 17 V19 A4 4 0 0 1 27 23 L25 22 A3 3 0 0 0 22.5 20.5 H11.5 A3 3 0 0 0 9 22 L7 23 A4 4 0 0 1 3 19 V17 A6 6 0 0 1 9 11 Z" />
      <line x1="9" y1="16.5" x2="13" y2="16.5" />
      <line x1="11" y1="14.5" x2="11" y2="18.5" />
      <circle cx="22" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="25.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CupIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 34 34"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 12 L11.6 28 A2 2 0 0 0 13.6 29.5 H20.4 A2 2 0 0 0 22.4 28 L24 12 Z" />
      <line x1="9" y1="12" x2="25" y2="12" />
      <line x1="9" y1="10" x2="25" y2="10" />
      <line x1="18" y1="8" x2="20" y2="3" />
      <line x1="12.4" y1="20" x2="21.6" y2="20" opacity="0.5" />
    </svg>
  );
}
