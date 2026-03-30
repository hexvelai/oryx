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
    ? "h-8 w-8"
    : large
      ? "flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10"
      : "h-10 w-10";
  const img = compact
    ? "h-6 w-6"
    : large
      ? "h-8 w-8 origin-center scale-[2.15] object-contain sm:h-9 sm:w-9 sm:scale-[2.35]"
      : "h-8 w-8";
  const gap = large ? (showLabel ? "gap-3" : "gap-0") : "gap-2.5";
  const labelSize = large ? "text-2xl sm:text-3xl" : "text-lg";

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
