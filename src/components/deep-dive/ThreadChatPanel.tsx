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
          <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc pl-6 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-6 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary/30 pl-3 italic text-muted-foreground">{children}</blockquote>,
        code: ({ children, className }) => (
          <code className={`rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] ${className ?? ""}`}>
            {children}
          </code>
        ),
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-xl bg-muted p-3">{children}</pre>,
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
    el.classList.add("ring-1", "ring-primary/30", "rounded-xl");
    window.setTimeout(() => {
      el.classList.remove("ring-1", "ring-primary/30", "rounded-xl");
    }, 900);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-4 py-6 sm:px-8 lg:px-14"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          {visibleMessages.length === 0 && (
            <div className="flex w-full justify-center pt-8">
              <div className="w-full max-w-md text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                </div>
                <h2 className="mt-5 text-balance text-lg font-medium text-foreground">
                  Start a conversation
                </h2>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                  Route with <span className="text-foreground">@gpt</span>,{" "}
                  <span className="text-foreground">@gemini</span>, or{" "}
                  <span className="text-foreground">@nemotron</span> — or just type and the project picks a model.
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  From any reply: ask another model, call a vote, or start a debate.
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
              <div
                key={message.id}
                id={`thread-msg-${message.id}`}
                className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div className={`min-w-0 ${isUser ? "max-w-[min(88%,28rem)]" : "w-full max-w-none"}`}>
                  {!isUser && (
                    <div className="group mb-1.5 flex items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                        {model ? (
                          <>
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                            <span className="font-medium">{model.name}</span>
                          </>
                        ) : (
                          <span>Assistant</span>
                        )}
                      </div>
                      {showActions ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                              aria-label="Message actions"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-1" align="end">
                            {onReplyToMessage && canSend ? (
                              <Button variant="ghost" size="sm" onClick={() => onReplyToMessage(message)} className="w-full justify-start text-xs">
                                Reply in thread
                              </Button>
                            ) : null}
                            {onReplyInHumanChat ? (
                              <Button variant="ghost" size="sm" onClick={() => onReplyInHumanChat(message)} className="w-full justify-start text-xs">
                                Reply in notes
                              </Button>
                            ) : null}
                            {canUseTools ? (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => onAskOther(visibleMessages.slice(0, idx + 1), provider)} className="w-full justify-start text-xs">
                                  Ask {AI_MODELS[defaultOther(provider)].name}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => onVote(visibleMessages.slice(0, idx + 1))} className="w-full justify-start text-xs">
                                  Call a vote
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => onDebate(visibleMessages.slice(0, idx + 1))} className="w-full justify-start text-xs">
                                  Start a debate
                                </Button>
                              </>
                            ) : null}
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                  )}
                  {isUser && authorLabel ? (
                    <div className="mb-1.5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{authorLabel}</span>
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={author?.image} />
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{initials(authorLabel)}</AvatarFallback>
                      </Avatar>
                    </div>
                  ) : null}

                  {isUser ? (
                    <div className="rounded-2xl bg-[hsl(var(--user-bubble))] px-4 py-3 text-sm leading-relaxed text-foreground">
                      {replyToMessageId ? (
                        <button
                          type="button"
                          onClick={() => jumpToMessage(replyToMessageId)}
                          className="mb-2 w-full rounded-lg bg-background/30 px-3 py-1.5 text-left text-xs"
                        >
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">In reply to</p>
                          <p className="mt-0.5 truncate text-foreground">{replyToExcerpt || "View message"}</p>
                        </button>
                      ) : null}
                      <div className="break-words text-pretty">{renderMarkdown(text)}</div>
                    </div>
                  ) : (
                    <div className="min-w-0 text-sm leading-relaxed text-foreground">
                      {replyToMessageId ? (
                        <button
                          type="button"
                          onClick={() => jumpToMessage(replyToMessageId)}
                          className="mb-2 w-full max-w-lg rounded-lg bg-accent/50 px-3 py-1.5 text-left text-xs"
                        >
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">In reply to</p>
                          <p className="mt-0.5 truncate text-foreground">{replyToExcerpt || "View message"}</p>
                        </button>
                      ) : null}
                      <div className="break-words text-pretty [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-border/40">
                        {renderMarkdown(text)}
                      </div>
                    </div>
                  )}

                  {!isUser && message.metadata?.routingNote && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{message.metadata.routingNote}</p>
                  )}
                </div>
              </div>
            );
          })}

          {isSending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/60" />
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/60" />
              <div className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/60" />
              <span className="ml-1 text-xs">Thinking...</span>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border/40 bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            onSend={onSend}
            placeholder="Message this thread..."
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
    </div>
  );
}
