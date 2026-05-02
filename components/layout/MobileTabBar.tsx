"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Activity,
  Wallet,
  LayoutGrid as Layout,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/journey", label: "Journey", Icon: Activity },
  { href: "/redeem", label: "Redeem", Icon: Wallet },
  { href: "/kanban", label: "Kanban", Icon: Layout },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="底部导航"
      className={cn(
        "mobile-tabbar",
        "fixed bottom-0 inset-x-0 z-90 md:hidden",
        "h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]",
        "bg-paper/92 backdrop-blur-xl backdrop-saturate-150 border-t border-rule",
        "grid grid-cols-5",
      )}
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname?.startsWith(href) ?? false;

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-h-11",
              "text-[10px] font-medium tracking-wider transition",
              isActive ? "text-ink" : "text-ink-3",
            )}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileTabBar;
