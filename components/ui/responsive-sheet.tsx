"use client";

/**
 * ResponsiveSheet — branches between bottom-sheet (mobile) and centered
 * dialog (desktop) based on `useIsMobile()`.
 *
 * Both branches share the same Radix-backed accessibility (focus trap,
 * Escape to dismiss, scroll lock).
 *
 * Side effect: while open, sets `data-sheet-open` on <body> so the
 * mobile tab bar (.mobile-tabbar) hides itself via globals.css. This
 * prevents the sticky bottom nav from peeking through the bottom sheet's
 * edge or competing for the user's thumb space.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ResponsiveSheet
 *     open={open} onOpenChange={setOpen}
 *     title="启动番茄" description="一句话写下要做的事">
 *     <YourFormHere />
 *   </ResponsiveSheet>
 */

import * as React from "react";
import { useEffect } from "react";
import { useIsMobile } from "@/lib/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ResponsiveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * If true, hides the visible title row (still rendered for a11y via
   * sr-only). Useful when content provides its own large headline.
   */
  hideHeader?: boolean;
  /**
   * Tailwind classes for the inner content container width on desktop.
   * Defaults to a 560px max width.
   */
  desktopWidthClass?: string;
  className?: string;
  children: React.ReactNode;
};

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  hideHeader = false,
  desktopWidthClass = "sm:max-w-[560px]",
  className,
  children,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();

  // Mark body while open so the mobile tab bar (.mobile-tabbar) hides
  // itself via globals.css `body[data-sheet-open] .mobile-tabbar`.
  // Counter pattern handles nested/concurrent sheets cleanly.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prev = parseInt(body.dataset.sheetOpenCount ?? "0", 10);
    body.dataset.sheetOpenCount = String(prev + 1);
    body.dataset.sheetOpen = "1";
    return () => {
      const cur = parseInt(body.dataset.sheetOpenCount ?? "1", 10) - 1;
      if (cur <= 0) {
        delete body.dataset.sheetOpenCount;
        delete body.dataset.sheetOpen;
      } else {
        body.dataset.sheetOpenCount = String(cur);
      }
    };
  }, [open]);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            // Defeat shadcn's gap-4 stack; sheet bodies layout themselves
            "gap-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl border-t border-rule bg-paper p-0 text-ink",
            className
          )}
        >
          {/* Drag handle visual cue */}
          <div className="sticky top-0 z-10 flex justify-center bg-paper/95 backdrop-blur-sm pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-ink-mute/50" aria-hidden />
          </div>
          <SheetHeader
            className={cn(
              "px-6 pt-2 pb-4",
              hideHeader && "sr-only"
            )}
          >
            <SheetTitle className="serif italic text-h3 leading-tight text-ink">
              {title}
            </SheetTitle>
            {description && (
              <SheetDescription className="text-sm text-ink-3 leading-relaxed">
                {description}
              </SheetDescription>
            )}
          </SheetHeader>
          <div
            className={cn(
              "px-6 pb-8",
              hideHeader && "pt-6"
            )}
            style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop — centered modal
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 rounded-2xl border-rule bg-paper p-0 text-ink",
          desktopWidthClass,
          className
        )}
        showCloseButton
      >
        <DialogHeader
          className={cn(
            "px-7 pt-7 pb-4",
            hideHeader && "sr-only"
          )}
        >
          <DialogTitle className="serif italic text-h3 leading-tight text-ink">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-ink-3 leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className={cn("px-7 pb-8", hideHeader && "pt-7")}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
