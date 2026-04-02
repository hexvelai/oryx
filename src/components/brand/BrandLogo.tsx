import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  compact?: boolean;
  large?: boolean;
  gradient?: boolean;
};

export function BrandLogo({
  className,
  iconClassName,
  labelClassName,
  showLabel = true,
  compact = false,
  large = false,
  gradient = false,
}: BrandLogoProps) {
  const wrap = compact
    ? "h-10 w-10"
    : large
      ? "flex h-12 w-12 items-center justify-center sm:h-14 sm:w-14"
      : "h-12 w-12";
  const img = compact
    ? "h-8 w-8"
    : large
      ? "h-12 w-12 object-contain sm:h-14 sm:w-14"
      : "h-10 w-10";
  const gap = large ? (showLabel ? "gap-3" : "gap-0") : "gap-2.5";
  const labelSize = large ? "text-3xl sm:text-4xl" : "text-xl";

  return (
    <div className={cn("flex items-center", gap, className)}>
      <span className={cn("flex items-center justify-center", wrap)}>
        <img
          src="/oryxmaroon.svg"
          alt=""
          aria-hidden="true"
          className={cn("block object-contain dark:hidden", img, iconClassName)}
        />
        <img
          src="/oryxwhite.svg"
          alt=""
          aria-hidden="true"
          className={cn("hidden object-contain dark:block", img, iconClassName)}
        />
      </span>
      {showLabel ? (
        <span className={cn(
          "font-display leading-none",
          gradient ? "gradient-text" : "text-foreground",
          labelSize,
          labelClassName,
        )}>
          oryx
        </span>
      ) : null}
    </div>
  );
}
