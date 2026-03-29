import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  /** Smaller mark for dense toolbars */
  compact?: boolean;
  /** Centered header mark: big draw via scale; keep layout box small so the bar height stays fixed */
  large?: boolean;
};

export function BrandLogo({
  className,
  iconClassName,
  labelClassName,
  showLabel = true,
  compact = false,
  large = false,
}: BrandLogoProps) {
  const wrap = compact
    ? "h-9 w-9"
    : large
      ? "flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10"
      : "h-14 w-14";
  const img = compact
    ? "h-7 w-7"
    : large
      ? "h-8 w-8 origin-center scale-[2.15] object-contain sm:h-9 sm:w-9 sm:scale-[2.35]"
      : "h-10 w-10";
  const gap = large ? (showLabel ? "gap-3" : "gap-0") : "gap-3";
  const labelSize = large ? "text-2xl sm:text-3xl" : "text-xl";

  return (
    <div className={cn("flex items-center", gap, className)}>
      <span className={cn("flex items-center justify-center", wrap)}>
        <img
          src="/oryx-logo-light.svg"
          alt=""
          aria-hidden="true"
          className={cn("block object-contain dark:hidden", img, iconClassName)}
        />
        <img
          src="/oryx-logo-dark.svg"
          alt=""
          aria-hidden="true"
          className={cn("hidden object-contain dark:block", img, iconClassName)}
        />
      </span>
      {showLabel ? (
        <span className={cn("font-display leading-none text-foreground", labelSize, labelClassName)}>
          oryx
        </span>
      ) : null}
    </div>
  );
}
