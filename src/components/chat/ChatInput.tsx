import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { floatingRaisedSurfaceClassName } from "@/lib/floating-surface";

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

  return (
    <div className={cn(floatingRaisedSurfaceClassName(true), "flex flex-col gap-2 p-3")}>
      {reply ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] dark:bg-background/20 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <button
            type="button"
            onClick={reply.onClick}
            className="min-w-0 flex-1 text-left"
          >
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Replying to</div>
            <div className="mt-1 truncate text-foreground">{reply.label}</div>
          </button>
          <Button type="button" variant="ghost" size="sm" onClick={reply.onCancel} className="h-7 px-2">
            ×
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-3">
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
          className="min-h-0 flex-1 resize-none px-1 py-2 leading-7 shadow-none"
          style={{ maxHeight: 120, height: "auto" }}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!actualValue.trim() || disabled}
          className="h-11 w-11 shrink-0 rounded-full focus-visible:ring-offset-0 dark:bg-primary dark:text-primary-foreground"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
