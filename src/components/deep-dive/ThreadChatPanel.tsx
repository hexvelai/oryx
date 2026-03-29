import { useEffect, useLayoutEffect, useRef } from "react";
import { MoreHorizontal, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatInput } from "@/components/chat/ChatInput";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import type { DeepDiveThreadRecord, DeepDiveUIMessage } from "@/lib/deep-dive-types";

function getMessageText(message: DeepDiveUIMessage) {
  return message.parts
    .filter(part => part.type === "text" || part.type === "reasoning")
    .map(part => part.text)
    .join("\n")
    .trim();
}

function initials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/g).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function renderMarkdown(content: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc pl-6 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-6 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border/70 pl-3 italic">{children}</blockquote>,
        code: ({ children, className }) => (
          <code className={`rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/[0.06] ${className ?? ""}`}>
            {children}
          </code>
        ),
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-[18px] bg-black/5 p-3 dark:bg-white/[0.06]">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function hasRenderableParts(message: DeepDiveUIMessage) {
  return message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return Boolean(part.text?.trim());
    }
    return true;
  });
}

interface ThreadChatPanelProps {
  thread: DeepDiveThreadRecord;
  onAskOther: (seedMessages: DeepDiveUIMessage[], provider?: AIProvider) => void;
  onVote: (seedMessages: DeepDiveUIMessage[]) => void;
  onDebate: (seedMessages: DeepDiveUIMessage[]) => void;
  onSend: (text: string) => void | Promise<void>;
  isSending: boolean;
  errorMessage?: string | null;
  defaultOther: (provider?: AIProvider) => AIProvider;
  canSend?: boolean;
  canUseTools?: boolean;
  onReplyToMessage?: (message: DeepDiveUIMessage) => void;
  onReplyInHumanChat?: (message: DeepDiveUIMessage) => void;
  replyTo?: { messageId: string; label: string } | null;
  onCancelReply?: () => void;
}

export function ThreadChatPanel({
  thread,
  onAskOther,
  onVote,
  onDebate,
  onSend,
  isSending,
  errorMessage,
  defaultOther,
  canSend = true,
  canUseTools = true,
  onReplyToMessage,
  onReplyInHumanChat,
  replyTo,
  onCancelReply,
}: ThreadChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const visibleMessages = thread.messages.filter(hasRenderableParts);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const isNearBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = isNearBottom();
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? "";

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, [lastMessageId, isSending]);

  const jumpToMessage = (messageId: string) => {
    const el = document.getElementById(`thread-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/40", "rounded-[26px]");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary/40", "rounded-[26px]");
    }, 900);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-5 py-5 sm:px-6">
        <div className="space-y-4">
          {visibleMessages.length === 0 && (
            <div className="mx-auto mt-12 max-w-xl rounded-[26px] border border-dashed border-border/80 bg-white/55 px-6 py-8 text-center dark:bg-white/[0.03]">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/75 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground dark:bg-white/[0.04]">
                <Sparkles className="h-3.5 w-3.5" />
                Ready to start
              </div>
              <div className="mt-5 text-2xl text-foreground">Ask directly or route with intent.</div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Mention a model with <span className="font-medium text-foreground">@GPT</span>, <span className="font-medium text-foreground">@Gemini</span>,
                or <span className="font-medium text-foreground">@Claude</span>, or let the thread choose for you.
              </p>
            </div>
          )}

          {visibleMessages.map((message, idx) => {
            const isUser = message.role === "user";
            const provider = message.metadata?.provider as AIProvider | undefined;
            const model = provider ? AI_MODELS[provider] : null;
            const text = getMessageText(message);
            const showActions = !isUser && (canUseTools || Boolean(onReplyToMessage) || Boolean(onReplyInHumanChat));
            const author = message.metadata?.author;
            const authorLabel = author ? (author.name || author.email || "Member").toString() : null;
            const replyToMessageId = message.metadata?.replyTo?.messageId;
            const replyToExcerpt = message.metadata?.replyTo?.excerpt;

            return (
              <div key={message.id} id={`thread-msg-${message.id}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] ${isUser ? "" : "group relative"}`}>
                  {!isUser && model && (
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                      <span>{model.name}</span>
                    </div>
                  )}
                  {isUser && authorLabel ? (
                    <div className="mb-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{authorLabel}</span>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={author?.image} />
                        <AvatarFallback className="text-[10px]">{initials(authorLabel)}</AvatarFallback>
                      </Avatar>
                    </div>
                  ) : null}

                  <div
                    className={`rounded-[22px] px-4 py-3 text-sm leading-7 shadow-sm ${
                      isUser
                        ? "border border-transparent bg-[hsl(var(--user-bubble))] text-foreground"
                        : "border border-border/70 bg-white/78 text-foreground dark:bg-white/[0.05]"
                    }`}
                  >
                    {showActions ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-9 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Message actions"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-1" align="end">
                          {onReplyToMessage && canSend ? (
                            <Button variant="ghost" size="sm" onClick={() => onReplyToMessage(message)} className="w-full justify-start">
                              Reply in thread
                            </Button>
                          ) : null}
                          {onReplyInHumanChat ? (
                            <Button variant="ghost" size="sm" onClick={() => onReplyInHumanChat(message)} className="w-full justify-start">
                              Reply in team chat
                            </Button>
                          ) : null}
                          {canUseTools ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => onAskOther(visibleMessages.slice(0, idx + 1), provider)} className="w-full justify-start">
                                Ask {AI_MODELS[defaultOther(provider)].name}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onVote(visibleMessages.slice(0, idx + 1))} className="w-full justify-start">
                                Call a vote
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onDebate(visibleMessages.slice(0, idx + 1))} className="w-full justify-start">
                                Start a debate
                              </Button>
                            </>
                          ) : null}
                        </PopoverContent>
                      </Popover>
                    ) : null}

                    {replyToMessageId ? (
                      <button
                        type="button"
                        onClick={() => jumpToMessage(replyToMessageId)}
                        className="mb-3 w-full rounded-[18px] border border-border/70 bg-white/60 px-3 py-2 text-left text-xs dark:bg-white/[0.03]"
                      >
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">In reply to</div>
                        <div className="mt-1 truncate text-foreground">{replyToExcerpt || "View message"}</div>
                      </button>
                    ) : null}

                    <div className="break-words text-pretty">{renderMarkdown(text)}</div>
                  </div>

                  {!isUser && message.metadata?.routingNote && (
                    <div className="mt-2 text-[12px] text-muted-foreground">{message.metadata.routingNote}</div>
                  )}
                </div>
              </div>
            );
          })}

          {isSending ? (
            <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span className="ml-1">Thinking...</span>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border/70 bg-[rgba(255,255,255,0.42)] p-3 dark:bg-[rgba(12,15,22,0.72)]">
        <ChatInput
          onSend={onSend}
          placeholder="Ask the thread a question or mention a model with @GPT, @Gemini, or @Claude"
          disabled={isSending || !canSend}
          autoFocus={true}
          reply={
            replyTo
              ? {
                  label: replyTo.label,
                  onClick: () => jumpToMessage(replyTo.messageId),
                  onCancel: onCancelReply,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
