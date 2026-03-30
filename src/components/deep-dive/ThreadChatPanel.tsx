import { useEffect, useLayoutEffect, useRef } from "react";
import { MoreHorizontal, Sparkles, Zap } from "lucide-react";
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
  return message.parts.filter(part => part.type === "text" || part.type === "reasoning").map(part => part.text).join("\n").trim();
}

function initials(value: string) {
  const t = value.trim();
  if (!t) return "?";
  const p = t.split(/\s+/g).filter(Boolean);
  return `${p[0]?.[0] ?? "?"}${p.length > 1 ? p[p.length - 1]?.[0] ?? "" : ""}`.toUpperCase();
}

function renderMarkdown(content: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">{children}</a>,
        ul: ({ children }) => <ul className="mb-2 list-disc pl-6 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-6 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-primary/30 pl-4 italic text-muted-foreground">{children}</blockquote>,
        code: ({ children, className }) => <code className={`rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.88em] ${className ?? ""}`}>{children}</code>,
        pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl bg-[hsl(240_5%_7%)] dark:bg-[hsl(240_5%_5%)] p-4 text-sm">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function hasRenderableParts(message: DeepDiveUIMessage) {
  return message.parts.some((part) => (part.type === "text" || part.type === "reasoning") ? Boolean(part.text?.trim()) : true);
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
  thread, onAskOther, onVote, onDebate, onSend, isSending, errorMessage, defaultOther,
  canSend = true, canUseTools = true, onReplyToMessage, onReplyInHumanChat, replyTo, onCancelReply,
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
    const onScroll = () => { stickToBottomRef.current = isNearBottom(); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? "";
  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => { endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }); });
  }, [lastMessageId, isSending]);

  const jumpToMessage = (messageId: string) => {
    const el = document.getElementById(`thread-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-1", "ring-primary/30", "rounded-xl");
    window.setTimeout(() => { el.classList.remove("ring-1", "ring-primary/30", "rounded-xl"); }, 900);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className="mx-auto max-w-[46rem] px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {/* Empty state */}
            {visibleMessages.length === 0 && (
              <div className="flex w-full justify-center pt-12 pb-8 animate-fade-up">
                <div className="w-full max-w-sm text-center">
                  <div className="relative mx-auto w-fit">
                    <div className="absolute inset-0 rounded-full bg-[hsl(var(--gradient-from)/0.15)] blur-2xl" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl gradient-border bg-card">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <h2 className="mt-6 text-xl font-display text-foreground">
                    What are you thinking about?
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Route with <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">@gpt</span>{" "}
                    <span className="rounded-md bg-[hsl(var(--ai-gemini)/0.1)] px-1.5 py-0.5 text-xs font-medium text-[hsl(var(--ai-gemini))]">@gemini</span>{" "}
                    <span className="rounded-md bg-[hsl(var(--ai-claude)/0.1)] px-1.5 py-0.5 text-xs font-medium text-[hsl(var(--ai-claude))]">@claude</span>{" "}
                    or just type.
                  </p>
                  <div className="mx-auto mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Vote</span>
                    <span className="h-3 w-px bg-border" />
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Debate</span>
                    <span className="h-3 w-px bg-border" />
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Branch</span>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
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
              const modelColor = model ? `hsl(var(--${model.color}))` : "hsl(var(--primary))";

              return (
                <div key={message.id} id={`thread-msg-${message.id}`} className={`flex w-full min-w-0 animate-fade-up ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`min-w-0 ${isUser ? "max-w-[min(85%,26rem)]" : "w-full max-w-none"}`}>
                    {/* AI message */}
                    {!isUser && (
                      <>
                        <div className="group mb-2 flex items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {model ? (
                              <>
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold" style={{ backgroundColor: `${modelColor}20`, color: modelColor }}>
                                  {model.name.slice(0, 1)}
                                </div>
                                <span className="text-xs font-medium" style={{ color: modelColor }}>{model.name}</span>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Assistant</span>
                            )}
                          </div>
                          {showActions && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"><MoreHorizontal className="h-3 w-3 text-muted-foreground" /></Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-44 p-1" align="end">
                                {onReplyToMessage && canSend && <Button variant="ghost" size="sm" onClick={() => onReplyToMessage(message)} className="w-full justify-start text-xs h-8">Reply in thread</Button>}
                                {onReplyInHumanChat && <Button variant="ghost" size="sm" onClick={() => onReplyInHumanChat(message)} className="w-full justify-start text-xs h-8">Reply in notes</Button>}
                                {canUseTools && (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => onAskOther(visibleMessages.slice(0, idx + 1), provider)} className="w-full justify-start text-xs h-8">Ask {AI_MODELS[defaultOther(provider)].name}</Button>
                                    <Button variant="ghost" size="sm" onClick={() => onVote(visibleMessages.slice(0, idx + 1))} className="w-full justify-start text-xs h-8">Call a vote</Button>
                                    <Button variant="ghost" size="sm" onClick={() => onDebate(visibleMessages.slice(0, idx + 1))} className="w-full justify-start text-xs h-8">Start a debate</Button>
                                  </>
                                )}
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>

                        {replyToMessageId && (
                          <button type="button" onClick={() => jumpToMessage(replyToMessageId)} className="mb-2 w-full max-w-md rounded-xl bg-accent/40 px-3 py-1.5 text-left text-xs">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">In reply to</p>
                            <p className="mt-0.5 truncate text-foreground">{replyToExcerpt || "View message"}</p>
                          </button>
                        )}

                        <div className="chat-bubble-ai pl-4" style={{ "--bubble-accent": modelColor } as React.CSSProperties}>
                          <div className="text-[15px] leading-[1.8] text-foreground break-words text-pretty [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-border/40">
                            {renderMarkdown(text)}
                          </div>
                        </div>

                        {message.metadata?.routingNote && <p className="mt-1 pl-4 text-[11px] text-muted-foreground/60">{message.metadata.routingNote}</p>}
                      </>
                    )}

                    {/* User message */}
                    {isUser && (
                      <>
                        {authorLabel && (
                          <div className="mb-1.5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{authorLabel}</span>
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={author?.image} />
                              <AvatarFallback className="text-[9px] bg-gradient-to-br from-[hsl(var(--gradient-from)/0.2)] to-[hsl(var(--gradient-via)/0.1)] text-primary">{initials(authorLabel)}</AvatarFallback>
                            </Avatar>
                          </div>
                        )}

                        {replyToMessageId && (
                          <button type="button" onClick={() => jumpToMessage(replyToMessageId)} className="mb-2 ml-auto block w-full max-w-[85%] rounded-xl bg-background/30 px-3 py-1.5 text-left text-xs">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">In reply to</p>
                            <p className="mt-0.5 truncate text-foreground">{replyToExcerpt || "View message"}</p>
                          </button>
                        )}

                        <div className="rounded-2xl bg-gradient-to-br from-[hsl(var(--gradient-from)/0.08)] to-[hsl(var(--gradient-via)/0.04)] border border-[hsl(var(--gradient-from)/0.12)] px-4 py-3 text-[15px] leading-[1.8] text-foreground">
                          <div className="break-words text-pretty">{renderMarkdown(text)}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Thinking indicator */}
            {isSending && (
              <div className="flex items-center gap-3 animate-fade-in pl-4">
                <div className="flex items-center gap-1.5">
                  <div className="typing-dot h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, hsl(var(--gradient-from)), hsl(var(--gradient-via)))" }} />
                  <div className="typing-dot h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, hsl(var(--gradient-via)), hsl(var(--gradient-to)))" }} />
                  <div className="typing-dot h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, hsl(var(--gradient-to)), hsl(var(--gradient-from)))" }} />
                </div>
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            )}

            {errorMessage && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMessage}</div>
            )}

            <div ref={endRef} />
          </div>
        </div>
      </div>

      {/* Chat input area */}
      <div className="relative border-t border-border/30">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[hsl(var(--gradient-from)/0.15)] to-transparent" />
        <div className="mx-auto max-w-[46rem] px-4 py-4 sm:px-6">
          <ChatInput
            onSend={onSend}
            placeholder="Message this thread..."
            disabled={isSending || !canSend}
            autoFocus={true}
            reply={replyTo ? { label: replyTo.label, onClick: () => jumpToMessage(replyTo.messageId), onCancel: onCancelReply } : null}
          />
        </div>
      </div>
    </div>
  );
}
