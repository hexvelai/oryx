import { cn } from "@/lib/utils";

const raisedBase = [
  "rounded-2xl border border-border/60",
  "bg-gradient-to-b from-card via-card to-muted/30 dark:to-muted/15",
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45),inset_0_-1px_0_0_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04),0_4px_14px_-3px_rgba(0,0,0,0.07)]",
  "dark:border-border/70 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),inset_0_-1px_0_0_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.25),0_6px_20px_-6px_rgba(0,0,0,0.55)]",
] as const;

const raisedFocusWithin = [
  "outline-none transition-[border-color,box-shadow] duration-200",
  "focus-within:border-border/80 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55),inset_0_-1px_0_0_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.05),0_8px_22px_-4px_rgba(0,0,0,0.1)]",
  "dark:focus-within:border-border/90 dark:focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.11),inset_0_-1px_0_0_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.35),0_10px_28px_-6px_rgba(0,0,0,0.65)]",
] as const;

/** Raised “floating” panel — matches composer tray. Use `focusWithin` for inputs. */
export function floatingRaisedSurfaceClassName(focusWithin = false) {
  return cn(...raisedBase, focusWithin && raisedFocusWithin);
}
