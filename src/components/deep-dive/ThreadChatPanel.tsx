import { useEffect, useLayoutEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
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

function getMessageText(msg: DeepDiveUIMessage) {
  return msg.parts.filter(p => p.type === "text" || p.type === "reasoning").map(p => p.text).join("\n").trim();
}

function initials(v: string) {
  const t = v.trim();
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
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4 hover:opacity-80">{children}</a>,
        ul: ({ children }) => <ul className="mb-2 list-disc pl-6 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-6 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border pl-3 italic text-muted-foreground">{children}</blockquote>,
        code: ({ children, className }) => <code className={`rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] ${className ?? ""}`}>{children}</code>,
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3.5 text-sm">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function hasRenderableParts(msg: DeepDiveUIMessage) {
  return msg.parts.some(p => (p.type === "text" || p.type === "reasoning") ? Boolean(p.text?.trim()) : true);
}

interface ThreadChatPanelProps {
  thread: DeepDiveThreadRecord;
  onAskOther: (seed: DeepDiveUIMessage[], provider?: AIProvider) => void;
  onVote: (seed: DeepDiveUIMessage[]) => void;
  onDebate: (seed: DeepDiveUIMessage[]) => void;
  onSend: (text: string) => void | Promise<void>;
  isSending: boolean;
  errorMessage?: string | null;
  defaultOther: (provider?: AIProvider) => AIProvider;
  canSend?: boolean;
  canUseTools?: boolean;
  onReplyToMessage?: (msg: DeepDiveUIMessage) => void;
  onReplyInHumanChat?: (msg: DeepDiveUIMessage) => void;
  replyTo?: { messageId: string; label: string } | null;
  onCancelReply?: () => void;
}

export function ThreadChatPanel({
  thread, onAskOther, onVote, onDebate, onSend, isSending, errorMessage, defaultOther,
  canSend = true, canUseTools = true, onReplyToMessage, onReplyInHumanChat, replyTo, onCancelReply,
}: ThreadChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const visible = thread.messages.filter(hasRenderableParts);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = () => el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near();
    const fn = () => { stickRef.current = near(); };
    el.addEventListener("scroll", fn, { passive: true });
    return () => el.removeEventListener("scroll", fn);
  }, []);

  const lastId = visible[visible.length - 1]?.id ?? "";
  useLayoutEffect(() => {
    if (!stickRef.current) return;
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }));
  }, [lastId, isSending]);

  const jump = (id: string) => {
    const el = document.getElementById(`thread-msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-1", "ring-primary/20", "rounded-lg");
    setTimeout(() => el.classList.remove("ring-1", "ring-primary/20", "rounded-lg"), 800);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className="mx-auto max-w-[44rem] px-4 py-6 sm:px-6">
          <div className="space-y-6">
            {visible.length === 0 && (
              <div className="pt-16 pb-8 text-center animate-fade-up">
                <p className="text-sm text-muted-foreground">Start typing to begin a conversation.</p>
                <p className="mt-1 text-xs text-muted-foreground/60">Use @gpt, @gemini, or @claude to route to a model.</p>
              </div>
            )}

            {visible.map((message, idx) => {
              const isUser = message.role === "user";
              const provider = message.metadata?.provider as AIProvider | undefined;
              const model = provider ? AI_MODELS[provider] : null;
              const text = getMessageText(message);
              const showActions = !isUser && (canUseTools || Boolean(onReplyToMessage) || Boolean(onReplyInHumanChat));
              const author = message.metadata?.author;
              const authorLabel = author ? (author.name || author.email || "Member").toString() : null;
              const replyId = message.metadata?.replyTo?.messageId;
              const replyExcerpt = message.metadata?.replyTo?.excerpt;
              const modelColor = model ? `hsl(var(--${model.color}))` : "hsl(var(--primary))";

              return (
                <div key={message.id} id={`thread-msg-${message.id}`} className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`min-w-0 ${isUser ? "max-w-[min(85%,26rem)]" : "w-full"}`}>
                    {!isUser && (
                      <div className="group mb-1 flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {model && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: modelColor }} />}
                          <span className="font-medium" style={model ? { color: modelColor } : undefined}>{model?.name ?? "Assistant"}</span>
                        </div>
                        {showActions && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ml-auto"><MoreHorizontal className="h-3 w-3 text-muted-foreground" /></Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="end">
                              {onReplyToMessage && canSend && <Button variant="ghost" size="sm" onClick={() => onReplyToMessage(message)} className="w-full justify-start text-xs h-7">Reply</Button>}
                              {onReplyInHumanChat && <Button variant="ghost" size="sm" onClick={() => onReplyInHumanChat(message)} className="w-full justify-start text-xs h-7">Note</Button>}
                              {canUseTools && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => onAskOther(visible.slice(0, idx + 1), provider)} className="w-full justify-start text-xs h-7">Ask {AI_MODELS[defaultOther(provider)].name}</Button>
                                  <Button variant="ghost" size="sm" onClick={() => onVote(visible.slice(0, idx + 1))} className="w-full justify-start text-xs h-7">Vote</Button>
                                  <Button variant="ghost" size="sm" onClick={() => onDebate(visible.slice(0, idx + 1))} className="w-full justify-start text-xs h-7">Debate</Button>
                                </>
                              )}
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    )}

                    {isUser && authorLabel && (
                      <div className="mb-1 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">{authorLabel}</span>
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={author?.image} />
                          <AvatarFallback className="text-[8px] bg-muted">{initials(authorLabel)}</AvatarFallback>
                        </Avatar>
                      </div>
                    )}

                    {replyId && (
                      <button type="button" onClick={() => jump(replyId)} className={`mb-1.5 block w-full rounded-lg bg-muted/50 px-3 py-1.5 text-left text-xs ${isUser ? "max-w-full" : "max-w-sm"}`}>
                        <span className="text-muted-foreground">Replying to: </span>
                        <span className="text-foreground">{replyExcerpt || "..."}</span>
                      </button>
                    )}

                    {isUser ? (
                      <div className="rounded-2xl bg-[hsl(var(--user-bubble))] px-4 py-2.5 text-[14px] leading-relaxed text-foreground">
                        <div className="break-words text-pretty">{renderMarkdown(text)}</div>
                      </div>
                    ) : (
                      <div className="chat-bubble-ai pl-3.5" style={{ "--bubble-accent": modelColor } as React.CSSProperties}>
                        <div className="text-[14px] leading-[1.75] text-foreground break-words text-pretty [&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_hr]:my-4 [&_hr]:border-border/40">
                          {renderMarkdown(text)}
                        </div>
                      </div>
                    )}

                    {!isUser && message.metadata?.routingNote && <p className="mt-1 pl-3.5 text-[11px] text-muted-foreground/50">{message.metadata.routingNote}</p>}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center gap-2 pl-3.5 animate-fade-in">
                <div className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/50" />
                <div className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/50" />
                <div className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/50" />
              </div>
            )}

            {errorMessage && <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{errorMessage}</div>}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <div className="border-t border-border/40 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-[44rem]">
          <ChatInput
            onSend={onSend}
            placeholder="Message..."
            disabled={isSending || !canSend}
            autoFocus={true}
            reply={replyTo ? { label: replyTo.label, onClick: () => jump(replyTo.messageId), onCancel: onCancelReply } : null}
          />
        </div>
      </div>
    </div>
  );
}
