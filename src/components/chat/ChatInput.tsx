import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="flex items-end gap-3 rounded-[24px] border border-border/80 bg-white/80 p-3 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] dark:bg-white/[0.04] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <Textarea
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-7 shadow-none focus-visible:ring-0"
        style={{ maxHeight: 120, height: "auto" }}
      />
      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        className="h-11 w-11 shrink-0 rounded-full dark:bg-primary dark:text-primary-foreground"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}
