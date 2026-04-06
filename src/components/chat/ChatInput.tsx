import { useState, useRef, useEffect, useMemo } from "react";
import { ArrowUp, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type MentionOption = { id: string; label: string; description?: string };

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  reply?: { label: string; onClick?: () => void; onCancel?: () => void; } | null;
  compact?: boolean;
  mentions?: MentionOption[];
}

export function ChatInput({ onSend, placeholder = "Type a message...", disabled, autoFocus = true, value, onChange, reply, compact, mentions }: ChatInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const actualValue = value ?? uncontrolledValue;
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionCaret, setMentionCaret] = useState<number | null>(null);
  const [mentionSelected, setMentionSelected] = useState(0);
  const [mentionPlacement, setMentionPlacement] = useState<"up" | "down">("down");
  const mentionListRef = useRef<HTMLDivElement>(null);
  const [mentionScrollTop, setMentionScrollTop] = useState(0);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const itemHeight = compact ? 32 : 36;
  const maxListHeight = 260;

  const rankedMentions = useMemo(() => {
    const all = mentions ?? [];
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return all;

    const fuzzyScore = (candidate: string, query: string) => {
      let qi = 0;
      let last = -1;
      let score = 0;
      for (let i = 0; i < candidate.length && qi < query.length; i += 1) {
        if (candidate[i] === query[qi]) {
          score += last >= 0 ? Math.max(1, 8 - (i - last)) : 8;
          last = i;
          qi += 1;
        }
      }
      return qi === query.length ? score : -1;
    };

    const scored = all
      .map((m, idx) => {
        const id = m.id.toLowerCase();
        const label = m.label.toLowerCase();
        let score = -1;
        if (id === q || label === q) score = 300;
        else if (id.startsWith(q)) score = 220;
        else if (label.startsWith(q)) score = 200;
        else if (id.includes(q)) score = 140;
        else if (label.includes(q)) score = 120;
        else {
          const f = Math.max(fuzzyScore(id, q), fuzzyScore(label, q));
          if (f >= 0) score = 60 + f;
        }
        return { m, idx, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

    return scored.map((r) => r.m);
  }, [mentions, mentionQuery]);

  useEffect(() => {
    if (!mentionOpen) return;
    setMentionSelected((i) => (rankedMentions.length ? Math.min(i, rankedMentions.length - 1) : 0));
  }, [mentionOpen, rankedMentions.length]);

  const computeMention = (nextValue: string, caret: number) => {
    const options = mentions ?? [];
    if (options.length === 0) return null;
    const beforeCaret = nextValue.slice(0, caret);
    const at = beforeCaret.lastIndexOf("@");
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(beforeCaret[at - 1] ?? "")) return null;
    const query = beforeCaret.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { at, query };
  };

  const commitValue = (next: string) => {
    if (onChange) onChange(next); else setUncontrolledValue(next);
  };

  const selectMention = (option: MentionOption) => {
    const el = inputRef.current;
    const caret = mentionCaret ?? el?.selectionStart ?? actualValue.length;
    const at = mentionStart ?? actualValue.lastIndexOf("@", caret);
    if (at < 0) return;
    const insert = `@${option.id} `;
    const next = actualValue.slice(0, at) + insert + actualValue.slice(caret);
    commitValue(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionCaret(null);
    setMentionSelected(0);
    setMentionScrollTop(0);
    requestAnimationFrame(() => {
      const target = inputRef.current;
      if (!target) return;
      const pos = at + insert.length;
      target.focus();
      target.setSelectionRange(pos, pos);
    });
  };

  const handleSubmit = () => {
    const trimmed = actualValue.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    commitValue("");
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionCaret(null);
    setMentionSelected(0);
    setMentionScrollTop(0);
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen && rankedMentions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelected((i) => (i + 1) % rankedMentions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelected((i) => (i - 1 + rankedMentions.length) % rankedMentions.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const opt = rankedMentions[mentionSelected];
        if (opt) selectMention(opt);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, compact ? 80 : 140) + "px"; }
  };

  const hasValue = actualValue.trim().length > 0;

  useEffect(() => {
    if (!mentionOpen) return;

    const compute = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const desired = Math.min(maxListHeight, rankedMentions.length * itemHeight) + 12;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement = spaceBelow < desired && spaceAbove > spaceBelow ? "up" : "down";
      setMentionPlacement(placement);
    };

    const raf = requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
    };
  }, [itemHeight, mentionOpen, rankedMentions.length]);

  useEffect(() => {
    if (!mentionOpen) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (root.contains(target)) return;
      setMentionOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mentionOpen]);

  useEffect(() => {
    if (!mentionOpen) return;
    const el = mentionListRef.current;
    if (!el) return;
    const top = mentionSelected * itemHeight;
    const bottom = top + itemHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [itemHeight, mentionOpen, mentionSelected]);

  const listHeight = Math.min(maxListHeight, rankedMentions.length * itemHeight);
  const startIndex = Math.max(0, Math.floor(mentionScrollTop / itemHeight) - 4);
  const endIndex = Math.min(rankedMentions.length, startIndex + Math.ceil(listHeight / itemHeight) + 8);
  const topPad = startIndex * itemHeight;
  const bottomPad = (rankedMentions.length - endIndex) * itemHeight;

  return (
    <div ref={rootRef} className={cn(
      "relative rounded-xl border border-border/50 bg-card transition-colors duration-150",
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
          onChange={e => {
            const v = e.target.value;
            const caret = e.target.selectionStart ?? v.length;
            commitValue(v);
            const mention = computeMention(v, caret);
            if (mention) {
              setMentionOpen(true);
              setMentionQuery(mention.query);
              setMentionStart(mention.at);
              setMentionCaret(caret);
              setMentionSelected(0);
              setMentionScrollTop(0);
            } else {
              setMentionOpen(false);
              setMentionQuery("");
              setMentionStart(null);
              setMentionCaret(null);
              setMentionSelected(0);
              setMentionScrollTop(0);
            }
            handleInput();
          }}
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

      {mentionOpen && (mentions?.length ?? 0) > 0 && (
        <div
          className={cn(
            "absolute left-0 right-0 z-50 overflow-hidden rounded-lg border border-border/50 bg-popover shadow-md",
            mentionPlacement === "down" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
          )}
        >
          <div
            ref={mentionListRef}
            className="overflow-y-auto scrollbar-thin"
            style={{ maxHeight: maxListHeight, height: listHeight }}
            onScroll={(e) => setMentionScrollTop((e.target as HTMLDivElement).scrollTop)}
          >
            {rankedMentions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            ) : (
              <div className="py-1">
                {topPad ? <div style={{ height: topPad }} /> : null}
                {rankedMentions.slice(startIndex, endIndex).map((opt, i) => {
                  const idx = startIndex + i;
                  const label = opt.label || opt.id;
                  const initials = label.trim().slice(0, 2).toUpperCase();
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectMention(opt); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 text-left transition-colors",
                        compact ? "h-8 text-xs" : "h-9 text-sm",
                        idx === mentionSelected ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <span className={cn("flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground", compact ? "h-5 w-5" : "h-6 w-6")}>
                        {initials}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{opt.label}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">@{opt.id}</span>
                    </button>
                  );
                })}
                {bottomPad ? <div style={{ height: bottomPad }} /> : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
