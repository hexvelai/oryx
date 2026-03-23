import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({ onSend, placeholder = "Type a message...", disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
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
    <div className="flex items-end gap-2 p-3 border-t border-border bg-card">
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
        style={{ maxHeight: 120 }}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground transition-all duration-150 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-105"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
