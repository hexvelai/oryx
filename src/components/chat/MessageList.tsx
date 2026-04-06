import { useRef, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { ChatMessage, AIProvider } from "@/types/ai";
import { AI_MODELS } from "@/types/ai";
import { useChatContext } from "@/context/ChatContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/ModelPicker";
import { MoreHorizontal } from "lucide-react";

interface MessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
  showProviderBadge?: boolean;
}

export function MessageList({ messages, isTyping, showProviderBadge }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { forkThreadFromMessages, sendDeepDiveMessage, runVoteInThread, runDebateInThread, activeProviders, availableProviders } = useChatContext();

  const [askDialog, setAskDialog] = useState<{ open: boolean; msgIndex: number } | null>(null);
  const [askTarget, setAskTarget] = useState<AIProvider>(availableProviders[0] ?? "nemotron");
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; msgIndex: number } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(
    availableProviders.length ? availableProviders : ((Object.keys(AI_MODELS) as AIProvider[]).slice(0, 1) || ["nemotron"]),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const defaultOther = (provider?: AIProvider) => {
    const order = availableProviders.length ? availableProviders : (Object.keys(AI_MODELS) as AIProvider[]);
    if (!provider) return order[0] ?? "nemotron";
    const idx = order.indexOf(provider);
    if (idx === -1) return order[0] ?? "nemotron";
    return order[(idx + 1) % order.length] ?? (order[0] ?? "nemotron");
  };

  useEffect(() => {
    if (availableProviders.length === 0) return;
    if (!availableProviders.includes(askTarget)) setAskTarget(availableProviders[0]);
    setDebateParticipants(prev => {
      const next = prev.filter(p => availableProviders.includes(p));
      return next.length ? next : [...availableProviders];
    });
  }, [availableProviders, askTarget]);

  const navigateToDive = (deepDiveId: string) => {
    if (!location.pathname.startsWith("/dive/")) navigate(`/dive/${deepDiveId}`);
  };

  const seedUpTo = (idx: number) => messages.slice(0, idx + 1);

  const onAsk = (idx: number, provider?: AIProvider) => {
    const next = defaultOther(provider);
    setAskTarget(next);
    setAskDialog({ open: true, msgIndex: idx });
  };

  const confirmAsk = () => {
    if (!askDialog) return;
    const seedMessages = seedUpTo(askDialog.msgIndex);
    const subject = seedMessages[seedMessages.length - 1]?.content ?? "";
    const { deepDiveId, threadId } = forkThreadFromMessages({
      type: "chat",
      title: `Ask ${AI_MODELS[askTarget].name}: ${subject.split("\n")[0]?.slice(0, 60) ?? ""}`,
      seedMessages,
    });
    setAskDialog(null);
    navigateToDive(deepDiveId);
    sendDeepDiveMessage(deepDiveId, threadId, `@${askTarget} Please respond to the context above.`);
  };

  const onVote = (idx: number) => {
    const seedMessages = seedUpTo(idx);
    const subject = (seedMessages[seedMessages.length - 1]?.content ?? "").split("\n")[0]?.trim() ?? "";
    const { deepDiveId, threadId } = forkThreadFromMessages({
      type: "vote",
      title: `Vote: ${subject.slice(0, 60)}`,
      seedMessages,
    });
    navigateToDive(deepDiveId);
    runVoteInThread(deepDiveId, threadId, subject);
  };

  const onDebate = (idx: number) => {
    setDebateParticipants(activeProviders.length ? activeProviders : availableProviders);
    setDebateDialog({ open: true, msgIndex: idx });
  };

  const confirmDebate = () => {
    if (!debateDialog) return;
    const seedMessages = seedUpTo(debateDialog.msgIndex);
    const subject = (seedMessages[seedMessages.length - 1]?.content ?? "").split("\n")[0]?.trim() ?? "";
    const participants = debateParticipants.length ? debateParticipants : availableProviders;
    const { deepDiveId, threadId } = forkThreadFromMessages({
      type: "teamwork",
      title: `Debate: ${subject.slice(0, 60)}`,
      seedMessages,
    });
    setDebateDialog(null);
    navigateToDive(deepDiveId);
    runDebateInThread(deepDiveId, threadId, subject, participants);
  };

  return (
    <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3 py-4 sm:space-y-6 sm:px-5">
      {messages.length === 0 && !isTyping && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Start a conversation...
        </div>
      )}
      {messages.map((msg, i) => (
        <div
          key={msg.id}
          className="animate-fade-up"
          style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
        >
          <MessageBubble
            message={msg}
            showProviderBadge={showProviderBadge}
            onAsk={() => onAsk(i, msg.provider as AIProvider | undefined)}
            onVote={() => onVote(i)}
            onDebate={() => onDebate(i)}
            askLabel={`Ask ${AI_MODELS[defaultOther(msg.provider as AIProvider | undefined)].name}`}
          />
        </div>
      ))}
      {isTyping && (
        <div className="animate-fade-up flex items-center gap-1 px-3 py-2">
          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        </div>
      )}
      <div ref={endRef} />

      <Dialog open={!!askDialog?.open} onOpenChange={(o) => !o && setAskDialog(null)}>
        <DialogContent className="border-border/50 bg-card sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ask another AI</DialogTitle>
          </DialogHeader>
          <div className="h-[min(420px,calc(100vh-14rem))] min-h-[260px]">
            <ModelPicker
              providers={availableProviders}
              orderProviders={availableProviders}
              selectedProviders={askTarget ? [askTarget] : []}
              onSelectedProvidersChange={(next) => {
                const target = next[0];
                if (target) setAskTarget(target);
              }}
              multiple={false}
              getModel={(p) => AI_MODELS[p]}
              showCategories={false}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAskDialog(null)}>
              Cancel
            </Button>
            <Button onClick={confirmAsk}>
              Ask
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!debateDialog?.open} onOpenChange={(o) => !o && setDebateDialog(null)}>
        <DialogContent className="border-border/50 bg-card sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Start a debate</DialogTitle>
          </DialogHeader>
          <div className="h-[min(420px,calc(100vh-14rem))] min-h-[260px]">
            <ModelPicker
              providers={availableProviders}
              orderProviders={availableProviders}
              selectedProviders={debateParticipants}
              onSelectedProvidersChange={setDebateParticipants}
              multiple
              getModel={(p) => AI_MODELS[p]}
              showCategories={false}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDebateDialog(null)}>
              Cancel
            </Button>
            <Button onClick={confirmDebate}>
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({
  message,
  showProviderBadge,
  onAsk,
  onVote,
  onDebate,
  askLabel,
}: {
  message: ChatMessage;
  showProviderBadge?: boolean;
  onAsk: () => void;
  onVote: () => void;
  onDebate: () => void;
  askLabel: string;
}) {
  const isUser = message.role === "user";
  const provider = message.provider as AIProvider | "master" | undefined;
  const model = provider && provider !== "master" ? AI_MODELS[provider] : null;
  const colorVar = provider === "master" ? "ai-master" : model?.color;

  return (
    <div className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`min-w-0 ${isUser ? "max-w-[min(92%,28rem)]" : "w-full max-w-none"}`}>
        {!isUser && (
          <div className="group mb-1 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {showProviderBadge && provider ? (
                <>
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorVar ? `hsl(var(--${colorVar}))` : undefined }}
                  />
                  <span
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    style={colorVar ? { color: `hsl(var(--${colorVar}))` } : undefined}
                  >
                    {provider === "master" ? "Router" : model?.name}
                  </span>
                </>
              ) : null}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Message actions"
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="end">
                <Button variant="ghost" size="sm" onClick={onAsk} className="w-full justify-start">
                  {askLabel}
                </Button>
                <Button variant="ghost" size="sm" onClick={onVote} className="w-full justify-start">
                  Call a vote
                </Button>
                <Button variant="ghost" size="sm" onClick={onDebate} className="w-full justify-start">
                  Start a debate
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {isUser ? (
          <div className="rounded-2xl bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm">
            <div className="break-words text-pretty">
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
                  table: ({ children }) => (
                    <div className="my-3 overflow-x-auto">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-black/5 dark:bg-white/[0.06]">{children}</thead>,
                  tr: ({ children }) => <tr className="border-b border-border/60 last:border-b-0">{children}</tr>,
                  th: ({ children }) => <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">{children}</th>,
                  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="min-w-0 text-[15px] leading-7 text-foreground sm:text-base">
            <div className="break-words text-pretty [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-border/60">
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
                  table: ({ children }) => (
                    <div className="my-3 overflow-x-auto">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-black/5 dark:bg-white/[0.06]">{children}</thead>,
                  tr: ({ children }) => <tr className="border-b border-border/60 last:border-b-0">{children}</tr>,
                  th: ({ children }) => <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">{children}</th>,
                  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            {typeof message.reasoningTokens === "number" && (
              <div className="mt-2 text-[12px] text-muted-foreground">Reasoning tokens: {message.reasoningTokens}</div>
            )}
            {message.routingNote && <div className="mt-2 text-[12px] text-muted-foreground">{message.routingNote}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
