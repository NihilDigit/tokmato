"use client";

import { useEffect, useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  LogIn,
  LogOut,
  Download,
  Trash2,
  CloudUpload,
  CloudDownload,
  GitBranch,
  ExternalLink,
  Bell,
  BellOff,
  BookOpen,
  Plus,
  Pencil,
} from "lucide-react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useTheme } from "@/components/theme-provider";
import { selectSnapshot, useStore } from "@/lib/store";
import { saveToCloud, loadFromCloud } from "@/app/actions/sync";
import { WelcomeGuideSheet } from "@/components/sheets/WelcomeGuideSheet";
import { EditTagSheet } from "@/components/sheets/EditTagSheet";
import { EditBonusSheet } from "@/components/sheets/EditBonusSheet";
import { TAG_CHIP_CLASSES } from "@/lib/tag-colors";
import type { BonusConfig, TagConfig } from "@/lib/types";
import {
  isPushSupported,
  getPermission,
  enablePush,
  disablePush,
  getCurrentSubscription,
} from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

type SyncStatus = "idle" | "saving" | "loading" | "ok" | "err";

function fmtSyncTime(ms: number): string {
  if (!ms) return "未同步";
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString();
}

type ThemeOption = "auto" | "light" | "dark";

const THEME_OPTIONS: {
  value: ThemeOption;
  label: string;
  Icon: typeof Sun;
}[] = [
  { value: "auto", label: "Auto", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { data: session, status } = useSession();
  const resetStore = useStore((s) => s.reset);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMsg, setSyncMsg] = useState<string>("");
  const [guideOpen, setGuideOpen] = useState(false);

  // Tag / Bonus management
  const tags = useStore((s) => s.tags);
  const bonuses = useStore((s) => s.bonuses);
  const addTag = useStore((s) => s.addTag);
  const updateTag = useStore((s) => s.updateTag);
  const removeTag = useStore((s) => s.removeTag);
  const addBonus = useStore((s) => s.addBonus);
  const updateBonus = useStore((s) => s.updateBonus);
  const removeBonus = useStore((s) => s.removeBonus);

  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [tagEditing, setTagEditing] = useState<TagConfig | null>(null);
  const [bonusSheetOpen, setBonusSheetOpen] = useState(false);
  const [bonusEditing, setBonusEditing] = useState<BonusConfig | null>(null);

  // Push subscription state — initialized from the live SW registration.
  const [pushSupported, setPushSupported] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string>("");

  useEffect(() => {
    setPushSupported(isPushSupported());
    if (!isPushSupported()) return;
    void getCurrentSubscription().then((sub) => setPushOn(Boolean(sub)));
  }, []);

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      const sub = await enablePush();
      if (sub) {
        setPushOn(true);
        setPushMsg("已开启");
      } else {
        const perm = getPermission();
        setPushMsg(
          perm === "denied"
            ? "权限被拒，到浏览器站点设置里开"
            : "未授予权限"
        );
      }
    } catch (e) {
      console.error("[settings] enablePush failed", e);
      setPushMsg("开启失败");
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      await disablePush();
      setPushOn(false);
      setPushMsg("已关闭");
    } catch (e) {
      console.error("[settings] disablePush failed", e);
      setPushMsg("关闭失败");
    } finally {
      setPushBusy(false);
    }
  };

  const handleSaveCloud = async () => {
    if (!session?.user) return;
    setSyncStatus("saving");
    try {
      const snapshot = selectSnapshot(useStore.getState());
      const res = await saveToCloud(snapshot);
      useStore.getState().markSynced(res.savedAt);
      setSyncStatus("ok");
      setSyncMsg(`已推送 ${fmtSyncTime(res.savedAt)}`);
    } catch (e) {
      console.error("[settings] saveToCloud failed", e);
      setSyncStatus("err");
      // Server actions surface error.message — match on the stable codes
      // emitted by `SyncError` so we can give actionable hints.
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("UNAUTHENTICATED")) {
        setSyncMsg("会话过期，请重新登录");
      } else if (msg.includes("PAYLOAD_TOO_LARGE")) {
        setSyncMsg("数据过大，先清理历史");
      } else if (msg.includes("INVALID_PAYLOAD")) {
        setSyncMsg("数据格式异常");
      } else if (msg.includes("RATE_LIMITED")) {
        setSyncMsg("操作过于频繁，稍后再试");
      } else {
        setSyncMsg("推送失败");
      }
    }
  };

  const handleLoadCloud = async () => {
    if (!session?.user) return;
    if (!confirm("从云端拉取会覆盖本地所有数据。继续?")) return;
    setSyncStatus("loading");
    try {
      const data = await loadFromCloud();
      if (!data) {
        setSyncStatus("idle");
        setSyncMsg("云端还没有保存过");
        return;
      }
      useStore
        .getState()
        .applyCloudSnapshot(
          data.snapshot as Partial<ReturnType<typeof useStore.getState>>,
          data.savedAt,
        );
      setSyncStatus("ok");
      setSyncMsg(`已拉取 ${fmtSyncTime(data.savedAt)}`);
    } catch (e) {
      console.error("[settings] loadFromCloud failed", e);
      setSyncStatus("err");
      setSyncMsg("拉取失败");
    }
  };

  const exportJson = () => {
    try {
      const raw = localStorage.getItem("tokmato:state");
      const parsed = raw ? JSON.parse(raw) : { state: {} };
      const blob = new Blob([JSON.stringify(parsed.state ?? parsed, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `tokmato-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[settings] export failed", e);
      alert("导出失败");
    }
  };

  const clearCache = () => {
    if (!confirm("清空本地记录并重置欢迎入账状态? 不能撤销。")) return;
    try {
      localStorage.removeItem("tokmato:state");
      // v9: welcome bonus is per-browser; clearing local also resets the
      // flag so the user can re-grant on next visit / login.
      localStorage.removeItem("tokmato:welcome-granted");
      resetStore();
      alert("已清空本地记录");
    } catch (e) {
      console.error("[settings] clear failed", e);
    }
  };

  const handleSignOut = async () => {
    if (
      !confirm(
        "退出会清空本地数据（token 余额、历史、看板、wishlist、自定义 tags 与 bonuses）。云端数据保留，下次登录可拉回。确定？",
      )
    )
      return;
    try {
      resetStore();
      localStorage.removeItem("tokmato:state");
      localStorage.removeItem("tokmato:welcome-granted");
      // 保留 tokmato:guide-seen — 引导已看，不重弹
    } catch (e) {
      console.error("[settings] signOut cleanup failed", e);
    }
    await signOut();
  };

  return (
    <main className="flex flex-col gap-10">
      {/* Page heading — text-h2 italic per spec, not text-display */}
      <header>
        <h1 className="serif italic text-h2 leading-tight">设置</h1>
      </header>

      <Hairline />

      {/* ───────────── Appearance ───────────── */}
      <Section title="外观">
        <div className="flex flex-col gap-3">
          <div
            role="radiogroup"
            aria-label="主题模式"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-rule bg-paper-2/60 p-1"
          >
            {THEME_OPTIONS.map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition",
                    active
                      ? "bg-ink text-paper shadow-soft"
                      : "text-ink-3 hover:text-ink",
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-3">
            现在是 <span className="text-ink-2">{resolvedTheme}</span>
            {theme === "auto" ? "（跟随系统）" : ""}
          </p>
        </div>
      </Section>

      <Hairline />

      {/* ───────────── Account ───────────── */}
      <Section title="账号">
        {status === "loading" ? (
          <p className="text-sm text-ink-3">加载中…</p>
        ) : session?.user ? (
          <div className="flex flex-wrap items-center gap-4">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? "user avatar"}
                width={44}
                height={44}
                className="h-11 w-11 rounded-full border border-rule object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/icon.png"
                alt="tokmato"
                width={44}
                height={44}
                className="h-11 w-11 rounded-full border border-rule bg-accent-foreground object-cover"
              />
            )}
            <div className="flex flex-col">
              <span className="serif text-base text-ink">
                {session.user.name ?? "未命名用户"}
              </span>
              {session.user.email && (
                <span className="mono text-xs text-ink-3">
                  {session.user.email}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-full border border-rule px-4 py-1.5 text-[13px] text-ink-2 transition hover:border-plum/40 hover:text-plum"
            >
              <LogOut size={14} />
              退出登录
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-3">
              未登录。登录后可在多设备同步番茄记录与水池水位。
            </p>
            <button
              type="button"
              onClick={() => signIn("github")}
              className="inline-flex w-fit min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper shadow-soft transition hover:bg-ink-2"
            >
              <LogIn size={15} />
              用 GitHub 登录
            </button>
          </div>
        )}
      </Section>

      <Hairline />

      <Hairline />

      {/* ───────────── Push notifications ───────────── */}
      <Section title="推送通知">
        {!pushSupported ? (
          <p className="text-sm text-ink-3">
            当前浏览器不支持 Web Push (Safari 需要把 tokmato 安装到主屏幕才行)。
          </p>
        ) : !session?.user ? (
          <p className="text-sm text-ink-3">登录 GitHub 后可开启,跨设备共用一套订阅。</p>
        ) : (
          <div className="flex flex-col gap-3">
            <GhostRow
              Icon={pushOn ? BellOff : Bell}
              title={pushOn ? "关闭推送" : "开启推送"}
              sub={
                pushOn
                  ? "番茄/缓冲结束走系统通知，关闭浏览器也能收到"
                  : "授权后浏览器关掉也能收到番茄到点提醒"
              }
              destructive={pushOn}
              disabled={pushBusy}
              onClick={pushOn ? handleDisablePush : handleEnablePush}
            />
            {pushMsg && (
              <p className="text-xs text-ink-3">{pushMsg}</p>
            )}
          </div>
        )}
      </Section>

      <Hairline />

      {/* ───────────── Cloud sync ───────────── */}
      <Section title="云端">
        {session?.user ? (
          <CloudSync
            handleSave={handleSaveCloud}
            handleLoad={handleLoadCloud}
            syncStatus={syncStatus}
            syncMsg={syncMsg}
          />
        ) : (
          <p className="text-sm text-ink-3">登录 GitHub 后自动同步开启。</p>
        )}
      </Section>

      <Hairline />

      {/* ───────────── Tags ───────────── */}
      <Section title="Tags">
        <div className="flex flex-col gap-3">
          {tags.length === 0 ? (
            <p className="text-sm text-ink-3">还没有 Tag。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {tags.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-rule px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[12px] leading-none",
                      TAG_CHIP_CLASSES[t.color],
                    )}
                  >
                    {t.label}
                  </span>
                  <span className="text-[12px] text-ink-mute">{t.id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTagEditing(t);
                      setTagSheetOpen(true);
                    }}
                    aria-label="编辑"
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-paper-2 hover:text-ink"
                  >
                    <Pencil size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setTagEditing(null);
              setTagSheetOpen(true);
            }}
            className="inline-flex w-fit min-h-9 items-center gap-1.5 rounded-full border border-dashed border-rule px-4 py-1.5 text-[13px] text-ink-2 transition hover:border-ink/30 hover:text-ink"
          >
            <Plus size={14} />
            新建 Tag
          </button>
        </div>
      </Section>

      <Hairline />

      {/* ───────────── 代币规则 (bonuses) ───────────── */}
      <Section title="代币规则">
        <div className="flex flex-col gap-3">
          {bonuses.length === 0 ? (
            <p className="text-sm text-ink-3">还没有 bonus 规则。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bonuses.map((b) => {
                const tag = tags.find((t) => t.id === b.tagId);
                return (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg border border-rule px-3 py-2.5"
                  >
                    {tag ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[12px] leading-none",
                          TAG_CHIP_CLASSES[tag.color],
                        )}
                      >
                        {tag.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-dashed border-rule px-2.5 py-1 font-mono text-[12px] leading-none text-ink-mute">
                        {b.tagId}
                      </span>
                    )}
                    <span className="mono text-[12px] text-ink-2">
                      起步 {b.threshold} 给 {b.initialReward} F · 之后每 +
                      {b.step} 给 {b.stepReward} F
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBonusEditing(b);
                        setBonusSheetOpen(true);
                      }}
                      aria-label="编辑"
                      className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-paper-2 hover:text-ink"
                    >
                      <Pencil size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            disabled={tags.length === 0}
            onClick={() => {
              setBonusEditing(null);
              setBonusSheetOpen(true);
            }}
            className="inline-flex w-fit min-h-9 items-center gap-1.5 rounded-full border border-dashed border-rule px-4 py-1.5 text-[13px] text-ink-2 transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            新建 Bonus
          </button>
          {tags.length > 0 && bonuses.length === 0 && (
            <p className="text-[11px] text-ink-mute">
              没有 bonus 规则时，番茄按基础单价计 F（输入 1 / 输出 0.5）。
            </p>
          )}
        </div>
      </Section>

      <Hairline />

      {/* ───────────── Data ───────────── */}
      <Section title="数据">
        <div className="flex flex-col gap-3">
          <GhostRow
            Icon={Download}
            title="导出全部记录"
            sub="JSON 文件，含 token 余额、wishlist、kanban、番茄串"
            onClick={exportJson}
          />
          <GhostRow
            Icon={Trash2}
            title="清空本地数据"
            sub="清空 token 余额、历史、看板、wishlist；保留同步配置"
            destructive
            onClick={clearCache}
          />
        </div>
      </Section>

      <Hairline />

      {/* ───────────── About ───────────── */}
      <Section title="关于">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <span className="serif italic text-h3 leading-none">tokmato</span>
            <span className="mono text-xs text-ink-3">{APP_VERSION}</span>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-ink-2">
            番茄 token 系统：把学习产出和娱乐消费用诚实的会计单位连起来。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex w-fit min-h-9 items-center gap-2 rounded-full border border-rule px-4 py-1.5 text-[13px] text-ink-2 transition hover:border-ink/30 hover:text-ink"
            >
              <BookOpen size={14} />
              入门指南
            </button>
            <a
              href="https://github.com/NihilDigit/tokmato"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit min-h-9 items-center gap-2 rounded-full border border-rule px-4 py-1.5 text-[13px] text-ink-2 transition hover:border-ink/30 hover:text-ink"
            >
              <GitBranch size={14} />
              GitHub
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </Section>

      <WelcomeGuideSheet open={guideOpen} onOpenChange={setGuideOpen} />

      <EditTagSheet
        open={tagSheetOpen}
        onOpenChange={(o) => {
          setTagSheetOpen(o);
          if (!o) setTagEditing(null);
        }}
        initial={
          tagEditing ? { label: tagEditing.label, color: tagEditing.color } : undefined
        }
        onConfirm={(data) => {
          if (tagEditing) {
            updateTag(tagEditing.id, data);
          } else {
            addTag(data);
          }
        }}
        onDelete={tagEditing ? () => removeTag(tagEditing.id) : undefined}
      />

      <EditBonusSheet
        open={bonusSheetOpen}
        onOpenChange={(o) => {
          setBonusSheetOpen(o);
          if (!o) setBonusEditing(null);
        }}
        tags={tags}
        initial={
          bonusEditing
            ? {
                tagId: bonusEditing.tagId,
                threshold: bonusEditing.threshold,
                initialReward: bonusEditing.initialReward,
                step: bonusEditing.step,
                stepReward: bonusEditing.stepReward,
              }
            : undefined
        }
        onConfirm={(data) => {
          if (bonusEditing) {
            updateBonus(bonusEditing.id, data);
          } else {
            addBonus(data);
          }
        }}
        onDelete={bonusEditing ? () => removeBonus(bonusEditing.id) : undefined}
      />
    </main>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function Hairline() {
  return <div className="h-px bg-rule" />;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="serif italic text-h3 leading-tight text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function GhostRow({
  Icon,
  title,
  sub,
  destructive,
  disabled,
  onClick,
}: {
  Icon: typeof Sun;
  title: string;
  sub: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-4 rounded-lg border border-rule bg-paper px-4 py-3 text-left transition",
        "hover:border-ink/25 hover:bg-paper-2/60",
        destructive && "hover:border-plum/40",
        disabled && "cursor-not-allowed opacity-60 hover:border-rule hover:bg-paper",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-paper-2 text-ink-3 transition",
          !disabled && "group-hover:text-ink",
          destructive && !disabled && "group-hover:text-plum",
        )}
      >
        <Icon size={15} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span
          className={cn(
            "text-sm text-ink",
            destructive && !disabled && "group-hover:text-plum",
          )}
        >
          {title}
        </span>
        <span className="text-xs leading-relaxed text-ink-3">{sub}</span>
      </span>
      {disabled && (
        <span className="ml-auto smallcaps text-ink-mute">soon</span>
      )}
    </button>
  );
}

function CloudSync({
  handleSave,
  handleLoad,
  syncStatus,
  syncMsg,
}: {
  handleSave: () => void | Promise<void>;
  handleLoad: () => void | Promise<void>;
  syncStatus: SyncStatus;
  syncMsg: string;
}) {
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const busy = syncStatus === "saving" || syncStatus === "loading";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 rounded-lg border border-rule bg-paper-2/40 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="smallcaps text-ink-2">自动同步</span>
          <span className="text-xs text-ink-3">
            余额变化 2 秒后自动推，打开应用时自动拉取较新版本
          </span>
        </div>
        <span className="mono text-xs text-ink-3 whitespace-nowrap">
          {lastSavedAt ? `上次 ${fmtSyncTime(lastSavedAt)}` : "未同步"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className={cn(
            "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rule bg-paper px-4 text-[13px] text-ink transition",
            "hover:border-ink/25 hover:bg-paper-2/60",
            busy && "cursor-not-allowed opacity-60",
          )}
        >
          <CloudUpload size={14} />
          立即推送
        </button>
        <button
          type="button"
          onClick={handleLoad}
          disabled={busy}
          className={cn(
            "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rule bg-paper px-4 text-[13px] text-ink transition",
            "hover:border-ink/25 hover:bg-paper-2/60",
            busy && "cursor-not-allowed opacity-60",
          )}
        >
          <CloudDownload size={14} />
          立即拉取
        </button>
      </div>

      {syncMsg && (
        <p
          className={cn(
            "text-xs",
            syncStatus === "err" ? "text-plum" : "text-ink-3",
          )}
        >
          {syncMsg}
        </p>
      )}
    </div>
  );
}
