import { useState, useRef, useEffect } from "react";
import { ArrowUp, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  reply?: { label: string; onClick?: () => void; onCancel?: () => void; } | null;
  compact?: boolean;
}

export function ChatInput({ onSend, placeholder = "Type a message...", disabled, autoFocus = true, value, onChange, reply, compact }: ChatInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const actualValue = value ?? uncontrolledValue;

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = () => {
    const trimmed = actualValue.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    if (onChange) onChange(""); else setUncontrolledValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleInput = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, compact ? 80 : 140) + "px";
    }
  };

  const hasValue = actualValue.trim().length > 0;

  return (
    <div className={cn(
      "relative rounded-2xl border border-border/40 bg-card transition-all duration-200",
      "focus-within:border-[hsl(var(--gradient-from)/0.3)] focus-within:shadow-[0_0_16px_-4px_hsl(var(--gradient-from)/0.1)]",
      compact ? "p-2" : "p-3",
    )}>
      {reply ? (
        <div className={cn("mb-2 flex items-start justify-between gap-2 rounded-xl bg-primary/[0.04] border border-primary/10 px-3 py-2 text-xs", compact && "mb-1.5")}>
          <button type="button" onClick={reply.onClick} className="min-w-0 flex-1 text-left">
            <p className="text-[10px] uppercase tracking-widest text-primary/60">Replying to</p>
            <p className="mt-0.5 truncate text-foreground">{reply.label}</p>
          </button>
          <button type="button" onClick={reply.onCancel} className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          variant="plain"
          value={actualValue}
          onChange={e => { const v = e.target.value; if (onChange) onChange(v); else setUncontrolledValue(v); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn("min-h-0 flex-1 resize-none px-1 leading-relaxed shadow-none", compact ? "py-1 text-xs" : "py-1.5 text-sm")}
          style={{ maxHeight: compact ? 80 : 140, height: "auto" }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasValue || disabled}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            compact ? "h-7 w-7" : "h-9 w-9",
            hasValue && !disabled
              ? "btn-gradient shadow-sm gradient-glow"
              : "bg-muted/60 text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          <ArrowUp className={cn(compact ? "h-3 w-3" : "h-4 w-4")} />
        </button>
      </div>
    </div>
  );
}
