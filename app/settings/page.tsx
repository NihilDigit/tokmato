"use client";

import { useState } from "react";
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
} from "lucide-react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useTheme } from "@/components/theme-provider";
import { useStore } from "@/lib/store";
import { saveToCloud, loadFromCloud } from "@/app/actions/sync";
import { cn } from "@/lib/utils";

type SyncStatus = "idle" | "saving" | "loading" | "ok" | "err";

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

  const handleSaveCloud = async () => {
    if (!session?.user) return;
    setSyncStatus("saving");
    try {
      const raw = localStorage.getItem("tokmato:state");
      const parsed = raw ? JSON.parse(raw) : { state: {} };
      const snapshot = parsed.state ?? parsed;
      const res = await saveToCloud(snapshot);
      setSyncStatus("ok");
      setSyncMsg(`已上传 · ${new Date(res.savedAt).toLocaleString()}`);
    } catch (e) {
      console.error("[settings] saveToCloud failed", e);
      setSyncStatus("err");
      setSyncMsg("上传失败 · 看 console");
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
      // Write directly into the persisted localStorage entry, then reload.
      localStorage.setItem(
        "tokmato:state",
        JSON.stringify({ state: data.snapshot, version: 1 })
      );
      setSyncStatus("ok");
      setSyncMsg(`已恢复 · ${new Date(data.savedAt).toLocaleString()} · 刷新页面`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      console.error("[settings] loadFromCloud failed", e);
      setSyncStatus("err");
      setSyncMsg("拉取失败 · 看 console");
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
      alert("导出失败 · 看 console");
    }
  };

  const clearCache = () => {
    if (!confirm("清空本地所有 token / 番茄记录 / 愿望? 不能撤销。")) return;
    try {
      localStorage.removeItem("tokmato:state");
      resetStore();
      alert("已清空 · 刷新看效果");
    } catch (e) {
      console.error("[settings] clear failed", e);
    }
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
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-rule bg-paper-2 text-sm text-ink-3">
                {(session.user.name ?? "?").slice(0, 1)}
              </div>
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
              onClick={() => signOut()}
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

      {/* ───────────── Cloud sync (only meaningful when signed in) ───── */}
      <Section title="云端">
        {session?.user ? (
          <div className="flex flex-col gap-3">
            <GhostRow
              Icon={CloudUpload}
              title="上传到云端"
              sub="把本地状态推到 Vercel KV · 覆盖云端旧记录"
              onClick={handleSaveCloud}
              disabled={syncStatus === "saving" || syncStatus === "loading"}
            />
            <GhostRow
              Icon={CloudDownload}
              title="从云端恢复"
              sub="拉取云端状态 · 覆盖本地"
              onClick={handleLoadCloud}
              disabled={syncStatus === "saving" || syncStatus === "loading"}
            />
            {syncMsg && (
              <p
                className={cn(
                  "text-xs",
                  syncStatus === "err" ? "text-plum" : "text-ink-3"
                )}
              >
                {syncMsg}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">登录 GitHub 后可在此跨设备同步。</p>
        )}
      </Section>

      <Hairline />

      {/* ───────────── Data ───────────── */}
      <Section title="数据">
        <div className="flex flex-col gap-3">
          <GhostRow
            Icon={Download}
            title="导出全部记录"
            sub="下载 JSON 文件 · 含 token 余额、wishlist、kanban、番茄串"
            onClick={exportJson}
          />
          <GhostRow
            Icon={Trash2}
            title="清空本地数据"
            sub="重置到 default mock state · 不能撤销"
            destructive
            onClick={clearCache}
          />
        </div>
      </Section>

      <Hairline />

      {/* ───────────── About ───────────── */}
      <Section title="关于">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <span className="serif italic text-h3 leading-none">tokmato</span>
            <span className="mono text-xs text-ink-3">v1.0</span>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-ink-2">
            番茄 token 系统：把学习产出和娱乐消费用诚实的会计单位连起来。
          </p>
        </div>
      </Section>
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
