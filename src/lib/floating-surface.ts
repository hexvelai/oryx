import { cn } from "@/lib/utils";

const raisedBase = [
  "rounded-2xl border border-border/50",
  "bg-card",
  "shadow-sm",
] as const;

const raisedFocusWithin = [
  "outline-none transition-[border-color,box-shadow] duration-200",
  "focus-within:border-primary/30 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
] as const;

export function floatingRaisedSurfaceClassName(focusWithin = false) {
  return cn(...raisedBase, focusWithin && raisedFocusWithin);
}
