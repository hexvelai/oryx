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

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const handleSubmit = () => {
    const trimmed = actualValue.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    if (onChange) onChange(""); else setUncontrolledValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  const handleInput = () => {
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, compact ? 80 : 140) + "px"; }
  };

  const hasValue = actualValue.trim().length > 0;

  return (
    <div className={cn(
      "rounded-xl border border-border/50 bg-card transition-colors duration-150",
      "focus-within:border-primary/25",
      compact ? "p-2" : "p-2.5",
    )}>
      {reply && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs">
          <button type="button" onClick={reply.onClick} className="min-w-0 flex-1 truncate text-left text-muted-foreground">
            Re: <span className="text-foreground">{reply.label}</span>
          </button>
          <button type="button" onClick={reply.onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      )}
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
          className={cn("min-h-0 flex-1 resize-none px-1 leading-relaxed shadow-none", compact ? "py-0.5 text-xs" : "py-1 text-sm")}
          style={{ maxHeight: compact ? 80 : 140, height: "auto" }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasValue || disabled}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg transition-all duration-150",
            compact ? "h-7 w-7" : "h-8 w-8",
            hasValue && !disabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground/30 cursor-not-allowed"
          )}
        >
          <ArrowUp className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </button>
      </div>
    </div>
  );
}
