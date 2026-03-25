import { useEffect, useRef } from "react";
import { MoreHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatInput } from "@/components/chat/ChatInput";
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

function renderRichText(content: string) {
  return content.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
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
}: ThreadChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const visibleMessages = thread.messages.filter(hasRenderableParts);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, isSending]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 sm:px-6">
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

            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] ${isUser ? "" : "group relative"}`}>
                  {!isUser && model && (
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                      <span>{model.name}</span>
                    </div>
                  )}

                  <div
                    className={`rounded-[22px] px-4 py-3 text-sm leading-7 shadow-sm ${
                      isUser
                        ? "border border-transparent bg-[hsl(var(--user-bubble))] text-foreground"
                        : "border border-border/70 bg-white/78 text-foreground dark:bg-white/[0.05]"
                    }`}
                  >
                    {!isUser && (
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
                          <Button variant="ghost" size="sm" onClick={() => onAskOther(visibleMessages.slice(0, idx + 1), provider)} className="w-full justify-start">
                            Ask {AI_MODELS[defaultOther(provider)].name}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onVote(visibleMessages.slice(0, idx + 1))} className="w-full justify-start">
                            Call a vote
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onDebate(visibleMessages.slice(0, idx + 1))} className="w-full justify-start">
                            Start a debate
                          </Button>
                        </PopoverContent>
                      </Popover>
                    )}

                    <div className="whitespace-pre-wrap break-words text-pretty">{renderRichText(text)}</div>
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
          disabled={isSending}
        />
      </div>
    </div>
  );
}
