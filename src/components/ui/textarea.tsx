import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** No border or focus ring — for inline chat-style inputs */
  variant?: "default" | "plain";
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, variant = "default", ...props }, ref) => {
  return (
    <textarea
      className={cn(
        variant === "plain"
          ? "flex w-full rounded-md border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
          : "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
