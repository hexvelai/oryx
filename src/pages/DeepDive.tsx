import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider, ChatMessage, DeepDiveThread } from "@/types/ai";
import { ChatInput } from "@/components/chat/ChatInput";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, PanelRight, X } from "lucide-react";

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupLabel(updatedAt: number) {
  const now = Date.now();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(updatedAt)) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Last 7 days";
}

function truncateOneLine(s: string, max = 48) {
  const first = (s.split("\n")[0] ?? "").trim().replace(/\s+/g, " ");
  if (first.length <= max) return first || "Thread";
  return `${first.slice(0, max - 1)}…`;
}

function renderRichText(content: string) {
  return (
    <div className="whitespace-pre-wrap break-words text-pretty">
      {content.split("**").map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

export default function DeepDive() {
  const navigate = useNavigate();
  const { diveId } = useParams();
  const {
    deepDives,
    availableProviders,
    activeThreadIdByDeepDive,
    setActiveDeepDive,
    setActiveThread,
    createThread,
    sendDeepDiveMessage,
    addDeepDiveUploads,
    removeDeepDiveUpload,
    forkThreadFromMessages,
    runVoteInThread,
    runDebateInThread,
  } = useChatContext();

  const deepDive = useMemo(() => deepDives.find(d => d.id === diveId) ?? null, [deepDives, diveId]);
  const activeThreadId = deepDive ? activeThreadIdByDeepDive[deepDive.id] : "";
  const activeThread = useMemo(() => {
    if (!deepDive) return null;
    return deepDive.threads.find(t => t.id === activeThreadId) ?? deepDive.threads[0] ?? null;
  }, [activeThreadId, deepDive]);

  useEffect(() => {
    if (deepDive) setActiveDeepDive(deepDive.id);
  }, [deepDive, setActiveDeepDive]);

  const [uploadsOpen, setUploadsOpen] = useState(true);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages.length, activeThread?.type, activeThread?.voteResults?.length, activeThread?.teamworkMessages?.length]);

  const [askDialog, setAskDialog] = useState<{ open: boolean; seed: ChatMessage[]; target: AIProvider } | null>(null);
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; seed: ChatMessage[] } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(
    deepDive.providers.filter(p => availableProviders.includes(p)),
  );

  if (!deepDive || !diveId) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center space-y-3">
          <div className="text-lg font-semibold text-foreground">Deep Dive not found</div>
          <Link to="/" className="text-sm text-primary underline">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const threadsByGroup = deepDive.threads
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .reduce<Record<string, DeepDiveThread[]>>((acc, t) => {
      const label = groupLabel(t.updatedAt);
      acc[label] = acc[label] ? [...acc[label], t] : [t];
      return acc;
    }, {});

  const newThread = () => {
    const id = createThread(deepDive.id, { title: "New thread", type: "chat", seedMessages: [] });
    setActiveThread(deepDive.id, id);
  };

  const seedUpTo = (idx: number) => {
    const msgs = activeThread?.messages ?? [];
    return msgs.slice(0, idx + 1);
  };

  const deepDiveProviders = deepDive.providers.filter(p => availableProviders.includes(p));
  const participantOrder = deepDiveProviders.length ? deepDiveProviders : (availableProviders.length ? availableProviders : (["gpt", "gemini", "claude"] as AIProvider[]));

  const defaultOther = (provider?: AIProvider) => {
    const order = participantOrder;
    if (!provider) return order[0] ?? "gpt";
    const idx = order.indexOf(provider);
    if (idx === -1) return order[0] ?? "gpt";
    return order[(idx + 1) % order.length] ?? (order[0] ?? "gpt");
  };

  const askOtherAI = (seedMessages: ChatMessage[], provider?: AIProvider) => {
    const next = defaultOther(provider);
    setAskDialog({ open: true, seed: seedMessages, target: next });
  };

  const confirmAskOther = () => {
    if (!askDialog) return;
    const seedMessages = askDialog.seed;
    const { threadId } = forkThreadFromMessages({
      deepDiveId: deepDive.id,
      type: "chat",
      title: `Ask ${AI_MODELS[askDialog.target].name}: ${truncateOneLine(seedMessages[seedMessages.length - 1]?.content ?? "")}`,
      seedMessages,
    });
    setAskDialog(null);
    sendDeepDiveMessage(deepDive.id, threadId, `@${askDialog.target} Please respond to the context above.`);
  };

  const callVote = (seedMessages: ChatMessage[]) => {
    const subject = truncateOneLine(seedMessages[seedMessages.length - 1]?.content ?? "", 60);
    const { threadId } = forkThreadFromMessages({
      deepDiveId: deepDive.id,
      type: "vote",
      title: `Vote: ${subject}`,
      seedMessages,
    });
    runVoteInThread(deepDive.id, threadId, subject);
  };

  const startDebate = (seedMessages: ChatMessage[]) => {
    setDebateParticipants(participantOrder);
    setDebateDialog({ open: true, seed: seedMessages });
  };

  const toggleDebater = (p: AIProvider) => {
    if (!availableProviders.includes(p)) return;
    setDebateParticipants(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const confirmDebate = () => {
    if (!debateDialog) return;
    const seedMessages = debateDialog.seed;
    const subject = truncateOneLine(seedMessages[seedMessages.length - 1]?.content ?? "", 60);
    const participants = (debateParticipants.length ? debateParticipants : participantOrder).filter(p => availableProviders.includes(p));
    const { threadId } = forkThreadFromMessages({
      deepDiveId: deepDive.id,
      type: "teamwork",
      title: `Debate: ${subject}`,
      seedMessages,
    });
    setDebateDialog(null);
    runDebateInThread(deepDive.id, threadId, subject, participants);
  };

  const onFilePick = (files: FileList | null) => {
    if (!files) return;
    addDeepDiveUploads(deepDive.id, Array.from(files));
  };

  const renderMessage = (message: ChatMessage, idx: number) => {
    const isUser = message.role === "user";
    const provider = message.provider as AIProvider | undefined;
    const model = provider ? AI_MODELS[provider] : null;
    return (
      <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[85%]">
          {!isUser && model && (
            <div className="text-xs font-medium mb-1" style={{ color: `hsl(var(--${model.color}))` }}>
              {model.name}
            </div>
          )}
          <div
            className={`relative group rounded-lg px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
              isUser ? "bg-secondary text-foreground" : "bg-card border border-border text-foreground"
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
                    onClick={() => askOtherAI(seedUpTo(idx), provider)}
                    className="w-full justify-start"
                  >
                    Ask {AI_MODELS[defaultOther(provider)].name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => callVote(seedUpTo(idx))}
                    className="w-full justify-start"
                  >
                    Call a vote
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startDebate(seedUpTo(idx))}
                    className="w-full justify-start"
                  >
                    Start a debate
                  </Button>
                </PopoverContent>
              </Popover>
            )}
            {renderRichText(message.content)}
          </div>
          {!isUser && message.routingNote && (
            <div className="mt-1 text-[12px]" style={{ color: "#7a8aaa" }}>
              {message.routingNote}
            </div>
          )}
        </div>
      </div>
    );
  };

  const contextMessages = activeThread?.messages ?? [];

  const voteResults = activeThread?.voteResults ?? [];
  const teamworkMessages = activeThread?.teamworkMessages ?? [];

  const voteWinner = voteResults.length
    ? [...voteResults].sort((a, b) => b.votes.length - a.votes.length)[0]
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="h-auto px-2 text-muted-foreground hover:text-foreground"
            >
              Deep Dives
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <div className="min-w-0">
              <div className="font-semibold text-sm text-foreground truncate">{deepDive.title}</div>
              <div className="mt-1 flex items-center gap-1.5">
                {deepDive.providers.map(p => (
                  <div
                    key={p}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold ring-1 ring-border"
                    style={{ backgroundColor: `hsl(var(--${AI_MODELS[p].color}) / 0.18)`, color: `hsl(var(--${AI_MODELS[p].color}))` }}
                  >
                    {AI_MODELS[p].name.slice(0, 1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUploadsOpen(v => !v)}
          >
            <PanelRight className="h-4 w-4" />
            Uploads
          </Button>
        </div>

        <div className="flex-1 overflow-hidden flex">
        <aside className="w-[240px] bg-muted/40 border-r border-border px-3 py-3 overflow-y-auto scrollbar-thin">
          <Button
            variant="outline"
            size="sm"
            onClick={newThread}
            className="w-full justify-start"
          >
            New Thread
          </Button>

          <div className="mt-4 space-y-4">
            {Object.entries(threadsByGroup).map(([label, threads]) => (
              <div key={label}>
                <div className="text-[11px] tracking-wide text-muted-foreground uppercase mb-1.5">
                  {label}
                </div>
                <div className="space-y-1">
                  {threads.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveThread(deepDive.id, t.id)}
                      className={`w-full text-left text-[13px] px-2 py-1.5 truncate rounded-md transition-colors ${
                        t.id === activeThreadId ? "bg-background text-foreground" : "text-foreground/80 hover:text-foreground hover:bg-accent/60"
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-hidden">
            <div className="flex flex-col h-full max-w-[720px] mx-auto w-full">
              <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3">
                {activeThread?.type === "chat" && (
                  <>
                    {contextMessages.length === 0 && (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        Start a thread…
                      </div>
                    )}
                    {contextMessages.map(renderMessage)}
                    <div ref={endRef} />
                  </>
                )}

                {activeThread?.type === "vote" && (
                  <>
                    {contextMessages.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Context</div>
                        <div className="space-y-2">
                          {contextMessages.slice(-6).map(renderMessage)}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 space-y-4">
                      {voteResults.length === 0 && (
                        <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                          AIs are deliberating…
                        </div>
                      )}
                      {voteResults.map(r => {
                        const model = AI_MODELS[r.provider];
                        const isWinner = voteWinner?.provider === r.provider;
                        const seed: ChatMessage[] = [
                          ...contextMessages,
                          { id: `vote-${activeThread?.id ?? "thread"}-${r.provider}`, role: "assistant", content: r.response, timestamp: Date.now(), provider: r.provider },
                        ];
                        return (
                          <div key={r.provider} className={`relative group border border-border bg-card rounded-lg p-4 ${isWinner ? "ring-2 ring-primary/20" : ""}`}>
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
                                  onClick={() => askOtherAI(seed, r.provider)}
                                  className="w-full justify-start"
                                >
                                  Ask {AI_MODELS[defaultOther(r.provider)].name}
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
                                  onClick={() => startDebate(seed)}
                                  className="w-full justify-start"
                                >
                                  Start a debate
                                </Button>
                              </PopoverContent>
                            </Popover>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium" style={{ color: `hsl(var(--${model.color}))` }}>
                                {model.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {r.votes.length} vote{r.votes.length === 1 ? "" : "s"}
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-foreground">{r.response}</div>
                            {r.votes.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {r.votes.map(v => (
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
                            <div className="mt-2 text-xs text-muted-foreground italic">{r.reasoning}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div ref={endRef} />
                  </>
                )}

                {activeThread?.type === "teamwork" && (
                  <>
                    {contextMessages.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Context</div>
                        <div className="space-y-2">
                          {contextMessages.slice(-6).map(renderMessage)}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 space-y-3">
                      {teamworkMessages.length === 0 && (
                        <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                          Debate in progress…
                        </div>
                      )}
                      {teamworkMessages.map((m, idx) => {
                        const from = AI_MODELS[m.from];
                        const toLabel = m.to === "all" ? "everyone" : AI_MODELS[m.to as AIProvider]?.name;
                        const seed: ChatMessage[] = [
                          ...contextMessages,
                          ...teamworkMessages.slice(0, idx + 1).map((tm, j) => ({
                            id: `tw-${activeThread?.id ?? "thread"}-${j}-${tm.id}`,
                            role: "assistant" as const,
                            content: tm.content,
                            timestamp: tm.timestamp || Date.now(),
                            provider: tm.from,
                          })),
                        ];
                        return (
                          <div key={m.id} className="relative group border border-border bg-card rounded-lg p-4">
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
                                  onClick={() => askOtherAI(seed, m.from)}
                                  className="w-full justify-start"
                                >
                                  Ask {AI_MODELS[defaultOther(m.from)].name}
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
                                  onClick={() => startDebate(seed)}
                                  className="w-full justify-start"
                                >
                                  Start a debate
                                </Button>
                              </PopoverContent>
                            </Popover>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium" style={{ color: `hsl(var(--${from.color}))` }}>{from.name}</span>
                              <span>→</span>
                              <span>{toLabel}</span>
                            </div>
                            <div className="mt-2 text-sm text-foreground whitespace-pre-wrap break-words">{m.content}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div ref={endRef} />
                  </>
                )}
              </div>

              {activeThread?.type === "chat" && (
                <ChatInput
                  onSend={(msg) => sendDeepDiveMessage(deepDive.id, activeThread.id, msg)}
                  placeholder="Message… (use @Claude, @GPT, @Gemini)"
                />
              )}
            </div>
          </div>

          {uploadsOpen && (
            <aside className="w-[280px] bg-muted/40 border-l border-border overflow-y-auto scrollbar-thin px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-medium text-foreground">Shared uploads</div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setUploadsOpen(false)}
                  aria-label="Close uploads"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              <div className="mt-3">
                <input
                  type="file"
                  multiple
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-border file:bg-card file:text-foreground hover:file:bg-accent"
                  onChange={(e) => onFilePick(e.target.files)}
                />
              </div>

              <div className="mt-4 space-y-2">
                {deepDive.uploads.length === 0 && (
                  <div className="text-xs text-muted-foreground">No uploads yet.</div>
                )}
                {deepDive.uploads.map(u => (
                  <div key={u.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {u.type.startsWith("image/") ? (
                        <img src={u.url} alt={u.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-[10px] text-muted-foreground px-1 text-center">
                          {u.name.split(".").pop()?.slice(0, 4)?.toUpperCase() ?? "FILE"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-foreground truncate">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{u.type || "file"}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDeepDiveUpload(deepDive.id, u.id)}
                      aria-label="Remove upload"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
        </div>
      </main>

      <Dialog open={!!askDialog?.open} onOpenChange={(o) => !o && setAskDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask another AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {participantOrder.map(p => (
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
            <Button onClick={confirmAskOther}>
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
            {participantOrder.map(p => (
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
