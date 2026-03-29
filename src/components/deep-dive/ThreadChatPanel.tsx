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
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-4 py-4 sm:px-5 sm:py-5"
      >
        <div className="space-y-4">
          {visibleMessages.length === 0 && (
            <div className="flex w-full justify-center pt-2 sm:pt-6">
              <div className="w-full max-w-md rounded-xl border border-border bg-muted/25 px-5 py-8 text-center dark:bg-muted/15">
                <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Thread ready
                </div>
                <h2 className="mt-5 text-balance text-lg font-medium leading-snug text-foreground sm:text-xl">
                  One thread, one line of thinking. Branch when you need to.
                </h2>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  Use <span className="font-medium text-foreground">@gpt</span>,{" "}
                  <span className="font-medium text-foreground">@gemini</span>, or{" "}
                  <span className="font-medium text-foreground">@nemotron</span> to route a message, or just type—the project picks a model when you do not.
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  From a reply menu: ask another model, call a vote, or start a debate.
                </p>
              </div>
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
                              Reply in project notes
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              <span className="ml-1">Thinking...</span>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background px-4 py-3 sm:px-5">
        <ChatInput
          onSend={onSend}
          placeholder="Ask this thread a question, or route with @gpt, @gemini, or @nemotron"
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
