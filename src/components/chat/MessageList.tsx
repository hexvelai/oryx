import { useRef, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { ChatMessage, AIProvider } from "@/types/ai";
import { AI_MODELS } from "@/types/ai";
import { useChatContext } from "@/context/ChatContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
  const [askTarget, setAskTarget] = useState<AIProvider>(availableProviders[0] ?? "gpt");
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; msgIndex: number } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(availableProviders.length ? availableProviders : ["gpt"]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const defaultOther = (provider?: AIProvider) => {
    const order = availableProviders.length ? availableProviders : (["gpt", "gemini", "claude"] as AIProvider[]);
    if (!provider) return order[0] ?? "gpt";
    const idx = order.indexOf(provider);
    if (idx === -1) return order[0] ?? "gpt";
    return order[(idx + 1) % order.length] ?? (order[0] ?? "gpt");
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
    const mention = askTarget === "gemini" ? "llama" : askTarget === "claude" ? "nemotron" : "gpt";
    sendDeepDiveMessage(deepDiveId, threadId, `@${mention} Please respond to the context above.`);
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
    setDebateParticipants(activeProviders.length ? activeProviders : (["gpt", "gemini", "claude"] as AIProvider[]));
    setDebateDialog({ open: true, msgIndex: idx });
  };

  const toggleDebater = (p: AIProvider) => {
    setDebateParticipants(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const confirmDebate = () => {
    if (!debateDialog) return;
    const seedMessages = seedUpTo(debateDialog.msgIndex);
    const subject = (seedMessages[seedMessages.length - 1]?.content ?? "").split("\n")[0]?.trim() ?? "";
    const participants = debateParticipants.length ? debateParticipants : (["gpt", "gemini", "claude"] as AIProvider[]);
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
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask another AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {availableProviders.map(p => (
              <label key={p} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent transition-colors">
                <Checkbox checked={askTarget === p} onCheckedChange={() => setAskTarget(p)} />
                <div className="text-sm font-medium text-foreground">{AI_MODELS[p].name}</div>
                <div className="text-xs text-muted-foreground truncate">{AI_MODELS[p].fullName}</div>
              </label>
            ))}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a debate</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {availableProviders.map(p => (
              <label key={p} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent transition-colors">
                <Checkbox checked={debateParticipants.includes(p)} onCheckedChange={() => toggleDebater(p)} />
                <div className="text-sm font-medium text-foreground">{AI_MODELS[p].name}</div>
                <div className="text-xs text-muted-foreground truncate">{AI_MODELS[p].fullName}</div>
              </label>
            ))}
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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative group max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-secondary text-foreground"
            : "bg-card border border-border text-foreground"
        }`}
      >
        {!isUser && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1.5 right-1.5 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Message actions"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="end">
              <Button
                variant="ghost"
                size="sm"
                onClick={onAsk}
                className="w-full justify-start"
              >
                {askLabel}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onVote}
                className="w-full justify-start"
              >
                Call a vote
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDebate}
                className="w-full justify-start"
              >
                Start a debate
              </Button>
            </PopoverContent>
          </Popover>
        )}

        {!isUser && showProviderBadge && provider && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: colorVar ? `hsl(var(--${colorVar}))` : undefined }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: colorVar ? `hsl(var(--${colorVar}))` : undefined }}
            >
              {provider === "master" ? "Router" : model?.name}
            </span>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-pretty">
          {message.content.split("**").map((part, i) =>
            i % 2 === 1 ? (
              <strong key={i} className="font-semibold">{part}</strong>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
        {!isUser && typeof message.reasoningTokens === "number" && (
          <div className="mt-1 text-[12px]" style={{ color: "#7a8aaa" }}>
            Reasoning tokens: {message.reasoningTokens}
          </div>
        )}
        {!isUser && message.routingNote && (
          <div className="mt-1 text-[12px]" style={{ color: "#7a8aaa" }}>
            {message.routingNote}
          </div>
        )}
      </div>
    </div>
  );
}
