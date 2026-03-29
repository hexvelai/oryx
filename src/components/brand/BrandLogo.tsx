import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  /** Smaller mark for dense toolbars */
  compact?: boolean;
};

export function BrandLogo({
  className,
  iconClassName,
  labelClassName,
  showLabel = true,
  compact = false,
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "flex items-center justify-center",
          compact ? "h-9 w-9" : "h-14 w-14",
        )}
      >
        <img
          src="/oryx-logo-light.svg"
          alt=""
          aria-hidden="true"
          className={cn(
            "block object-contain dark:hidden",
            compact ? "h-7 w-7" : "h-10 w-10",
            iconClassName,
          )}
        />
        <img
          src="/oryx-logo-dark.svg"
          alt=""
          aria-hidden="true"
          className={cn(
            "hidden object-contain dark:block",
            compact ? "h-7 w-7" : "h-10 w-10",
            iconClassName,
          )}
        />
      </span>
      {showLabel ? (
        <span className={cn("font-display text-xl leading-none text-foreground", labelClassName)}>
          oryx
        </span>
      ) : null}
    </div>
  );
}
