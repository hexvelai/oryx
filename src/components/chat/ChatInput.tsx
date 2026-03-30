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
  reply?: {
    label: string;
    onClick?: () => void;
    onCancel?: () => void;
  } | null;
}

export function ChatInput({ onSend, placeholder = "Type a message...", disabled, autoFocus = true, value, onChange, reply }: ChatInputProps) {
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
    if (onChange) {
      onChange("");
    } else {
      setUncontrolledValue("");
    }
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  };

  const hasValue = actualValue.trim().length > 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3 transition-colors focus-within:border-primary/30">
      {reply ? (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-accent/50 px-3 py-2 text-xs">
          <button
            type="button"
            onClick={reply.onClick}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Replying to</p>
            <p className="mt-0.5 truncate text-foreground">{reply.label}</p>
          </button>
          <button type="button" onClick={reply.onCancel} className="mt-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          variant="plain"
          value={actualValue}
          onChange={e => {
            const next = e.target.value;
            if (onChange) {
              onChange(next);
            } else {
              setUncontrolledValue(next);
            }
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-0 flex-1 resize-none px-1 py-1.5 leading-relaxed shadow-none text-sm"
          style={{ maxHeight: 120, height: "auto" }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasValue || disabled}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150",
            hasValue && !disabled
              ? "btn-gradient shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
