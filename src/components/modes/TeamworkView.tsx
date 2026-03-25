import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider, ChatMessage } from "@/types/ai";
import { Network, ArrowRight, MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function TeamworkView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { teamworkMessages, masterMessages, sharedContext, forkThreadFromMessages, sendDeepDiveMessage, runVoteInThread, runDebateInThread, activeProviders } = useChatContext();
  const [askDialog, setAskDialog] = useState<{ open: boolean; target: AIProvider; seed: ChatMessage[] } | null>(null);
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; seed: ChatMessage[] } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(["gpt", "gemini", "claude"]);

  const finalMsg = masterMessages.find(m => m.provider === "master" && m.content.includes("Team Consensus"));

  const defaultOther = (provider: AIProvider) => {
    const order: AIProvider[] = ["gpt", "gemini", "claude"];
    return order[(order.indexOf(provider) + 1) % order.length];
  };

  const navigateToDive = (deepDiveId: string) => {
    if (!location.pathname.startsWith("/dive/")) navigate(`/dive/${deepDiveId}`);
  };

  const openAsk = (provider: AIProvider, seed: ChatMessage[]) => {
    setAskDialog({ open: true, target: defaultOther(provider), seed });
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
        <Network className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Teamwork Mode</span>
        <span className="text-xs text-muted-foreground">— AIs collaborate in real-time</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        {teamworkMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            AIs are thinking together...
          </div>
        )}
        {teamworkMessages.map((msg, i) => {
          const fromModel = AI_MODELS[msg.from];
          const toLabel = msg.to === "all" ? "everyone" : AI_MODELS[msg.to as keyof typeof AI_MODELS]?.name;
          const seed: ChatMessage[] = [
            ...sharedContext,
            ...teamworkMessages.slice(0, i + 1).map((m, j) => ({
              id: `tw-${j}-${m.id}`,
              role: "assistant",
              content: m.content,
              timestamp: m.timestamp || Date.now(),
              provider: m.from,
            })),
          ];
          return (
            <div key={msg.id} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 ring-1 ring-border"
                  style={{
                    backgroundColor: `hsl(var(--${fromModel.color}) / 0.12)`,
                    color: `hsl(var(--${fromModel.color}))`,
                  }}
                >
                  {fromModel.name[0]}
                </div>
                <div className="flex-1 min-w-0 relative group">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Message actions"
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-1" align="end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAsk(msg.from, seed)}
                        className="w-full justify-start"
                      >
                        Ask {AI_MODELS[defaultOther(msg.from)].name}
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
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: `hsl(var(--${fromModel.color}))` }}>
                      {fromModel.name}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{toLabel}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed text-pretty">{msg.content}</p>
                </div>
              </div>
            </div>
          );
        })}

        {finalMsg && (
          <Card className="relative group animate-fade-up mt-6 p-4 border border-primary/20 bg-primary/5">
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
                  onClick={() => openAsk("gpt", [...sharedContext, finalMsg])}
                  className="w-full justify-start"
                >
                  Ask {AI_MODELS[defaultOther("gpt")].name}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => callVote([...sharedContext, finalMsg])}
                  className="w-full justify-start"
                >
                  Call a vote
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDebate([...sharedContext, finalMsg])}
                  className="w-full justify-start"
                >
                  Start a debate
                </Button>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <Badge className="rounded-md">Final Consensus</Badge>
            </div>
            <p className="text-sm text-foreground leading-relaxed text-pretty">
              {finalMsg.content.replace("**Team Consensus:** ", "")}
            </p>
          </Card>
        )}
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
