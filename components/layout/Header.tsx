"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home" },
  { label: "Journey", href: "/journey" },
  { label: "Redeem", href: "/redeem" },
  { label: "Kanban", href: "/kanban" },
  { label: "Settings", href: "/settings" },
];

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const avatarSrc = session?.user?.image ?? "/icon.png";

  return (
    <header className="mb-7 flex items-center justify-between gap-4">
      {/* Left: logo */}
      <Link
        href="/home"
        className="flex items-baseline gap-2 no-underline"
      >
        <span className="text-xl leading-none" aria-hidden>
          🍅
        </span>
        <span className="font-serif italic text-xl tracking-tight text-ink">
          tokmato
        </span>
        <span className="smallcaps text-ink-mute">{APP_VERSION}</span>
      </Link>

      {/* Center: segmented nav (desktop only) */}
      <nav
        aria-label="Primary"
        className="desktop-only-nav bg-paper-2/60 border border-rule rounded-full p-1 flex gap-1"
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="no-underline"
            >
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-full transition",
                  isActive
                    ? "bg-ink text-paper"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {item.label}
              </button>
            </Link>
          );
        })}
      </nav>

      {/* Right: account avatar */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarSrc}
        alt={session?.user?.name ? `${session.user.name} avatar` : "tokmato"}
        width={28}
        height={28}
        className="size-7 rounded-full border border-rule bg-accent-foreground object-cover"
      />
    </header>
  );
}
