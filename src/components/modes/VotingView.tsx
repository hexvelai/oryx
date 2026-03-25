import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider, ChatMessage } from "@/types/ai";
import { Vote, ThumbsUp, Trophy, MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function VotingView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { voteResults, sharedContext, forkThreadFromMessages, sendDeepDiveMessage, runVoteInThread, runDebateInThread, activeProviders } = useChatContext();
  const [askDialog, setAskDialog] = useState<{ open: boolean; target: AIProvider; seed: ChatMessage[] } | null>(null);
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; seed: ChatMessage[] } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(["gpt", "gemini", "claude"]);

  const winner = voteResults.length > 0
    ? [...voteResults].sort((a, b) => b.votes.length - a.votes.length)[0]
    : null;

  const defaultOther = (provider: AIProvider) => {
    const order: AIProvider[] = ["gpt", "gemini", "claude"];
    return order[(order.indexOf(provider) + 1) % order.length];
  };

  const navigateToDive = (deepDiveId: string) => {
    if (!location.pathname.startsWith("/dive/")) navigate(`/dive/${deepDiveId}`);
  };

  const openAsk = (provider: AIProvider, seed: ChatMessage[]) => {
    const target = defaultOther(provider);
    setAskDialog({ open: true, target, seed });
  };

  const confirmAsk = () => {
    if (!askDialog) return;
    const { deepDiveId, threadId } = forkThreadFromMessages({
      type: "chat",
      title: `Ask ${AI_MODELS[askDialog.target].name}: ${askDialog.seed[askDialog.seed.length - 1]?.content.split("\n")[0]?.slice(0, 60) ?? ""}`,
      seedMessages: askDialog.seed,
    });
    setAskDialog(null);
    navigateToDive(deepDiveId);
    sendDeepDiveMessage(deepDiveId, threadId, `@${askDialog.target} Please respond to the context above.`);
  };

  const callVote = (seed: ChatMessage[]) => {
    const subject = seed[seed.length - 1]?.content.split("\n")[0]?.trim() ?? "";
    const { deepDiveId, threadId } = forkThreadFromMessages({ type: "vote", title: `Vote: ${subject.slice(0, 60)}`, seedMessages: seed });
    navigateToDive(deepDiveId);
    runVoteInThread(deepDiveId, threadId, subject);
  };

  const openDebate = (seed: ChatMessage[]) => {
    setDebateParticipants(activeProviders.length ? activeProviders : (["gpt", "gemini", "claude"] as AIProvider[]));
    setDebateDialog({ open: true, seed });
  };

  const toggleDebater = (p: AIProvider) => {
    setDebateParticipants(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const confirmDebate = () => {
    if (!debateDialog) return;
    const subject = debateDialog.seed[debateDialog.seed.length - 1]?.content.split("\n")[0]?.trim() ?? "";
    const participants = debateParticipants.length ? debateParticipants : (["gpt", "gemini", "claude"] as AIProvider[]);
    const { deepDiveId, threadId } = forkThreadFromMessages({ type: "teamwork", title: `Debate: ${subject.slice(0, 60)}`, seedMessages: debateDialog.seed });
    setDebateDialog(null);
    navigateToDive(deepDiveId);
    runDebateInThread(deepDiveId, threadId, subject, participants);
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-background">
        <Vote className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Voting Mode</span>
        <span className="text-xs text-muted-foreground">— AIs propose and vote on solutions</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        {voteResults.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="flex items-center gap-1.5">
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="ml-2">AIs are deliberating...</span>
            </div>
          </div>
        )}
        {voteResults.map((result, i) => {
          const model = AI_MODELS[result.provider];
          const isWinner = winner?.provider === result.provider;
          const seed: ChatMessage[] = [
            ...sharedContext,
            { id: `vote-${result.provider}-${i}`, role: "assistant", content: result.response, timestamp: Date.now(), provider: result.provider },
          ];
          return (
            <div
              key={result.provider}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div
                className={`relative group p-4 rounded-lg border transition-shadow ${
                  isWinner ? "border-primary/30 bg-primary/5 shadow-sm" : "border-border bg-card"
                }`}
              >
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Message actions"
                    >
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-1" align="end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAsk(result.provider, seed)}
                      className="w-full justify-start"
                    >
                      Ask {AI_MODELS[defaultOther(result.provider)].name}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => callVote(seed)}
                      className="w-full justify-start"
                    >
                      Call a vote
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDebate(seed)}
                      className="w-full justify-start"
                    >
                      Start a debate
                    </Button>
                  </PopoverContent>
                </Popover>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold ring-1 ring-border"
                      style={{
                        backgroundColor: `hsl(var(--${model.color}) / 0.12)`,
                        color: `hsl(var(--${model.color}))`,
                      }}
                    >
                      {model.name[0]}
                    </div>
                    <span className="font-medium text-sm" style={{ color: `hsl(var(--${model.color}))` }}>
                      {model.name}
                    </span>
                    {isWinner && (
                      <Badge className="rounded-md">
                        <Trophy className="w-3 h-3" /> Winner
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ThumbsUp className="w-3 h-3" />
                    {result.votes.length} votes
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed mb-2 text-pretty">{result.response}</p>
                {result.votes.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-xs text-muted-foreground">Voted by:</span>
                    {result.votes.map(v => (
                      <Badge
                        key={v}
                        variant="secondary"
                        className="rounded-md"
                        style={{
                          backgroundColor: `hsl(var(--${AI_MODELS[v].color}) / 0.1)`,
                          color: `hsl(var(--${AI_MODELS[v].color}))`,
                        }}
                      >
                        {AI_MODELS[v].name}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground italic mt-2">{result.reasoning}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!askDialog?.open} onOpenChange={(o) => !o && setAskDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask another AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(Object.keys(AI_MODELS) as AIProvider[]).map(p => (
              <label key={p} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent transition-colors">
                <Checkbox checked={askDialog?.target === p} onCheckedChange={() => askDialog && setAskDialog({ ...askDialog, target: p })} />
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
            {(Object.keys(AI_MODELS) as AIProvider[]).map(p => (
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
