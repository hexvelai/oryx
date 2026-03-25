import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import {
  ChevronLeft,
  MessageSquareText,
  MoreHorizontal,
  Scale,
  Users2,
} from "lucide-react";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { convexApi } from "@/lib/convex-api";
import type { DeepDiveThreadRecord, DeepDiveUIMessage } from "@/lib/deep-dive-types";
import { DEEP_DIVE_PROVIDERS } from "@/lib/deep-dive-types";
import { ThreadChatPanel } from "@/components/deep-dive/ThreadChatPanel";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  return "Earlier";
}

function truncateOneLine(s: string, max = 48) {
  const first = (s.split("\n")[0] ?? "").trim().replace(/\s+/g, " ");
  if (first.length <= max) return first || "Thread";
  return `${first.slice(0, max - 1)}...`;
}

function getMessageText(message: DeepDiveUIMessage) {
  return message.parts
    .filter(part => part.type === "text" || part.type === "reasoning")
    .map(part => part.text)
    .join("\n")
    .trim();
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

function threadTypeCopy(type: DeepDiveThreadRecord["type"]) {
  if (type === "vote") return { label: "Vote", detail: "Multiple models propose and score the best path." };
  if (type === "teamwork") return { label: "Debate", detail: "Models collaborate in sequence and build on each other." };
  return { label: "Thread", detail: "Direct conversation with routing and branching." };
}

function formatDateTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ts);
}

export default function DeepDive() {
  const navigate = useNavigate();
  const { diveId } = useParams();
  const deepDive = useConvexQuery(convexApi.deepDives.get, diveId ? { diveId } : "skip");
  const createThread = useConvexMutation(convexApi.deepDives.createThread);
  const appendUserMessage = useConvexMutation(convexApi.deepDives.appendUserMessage);
  const sendThreadMessage = useAction(convexApi.ai.sendThreadMessage);
  const runVote = useAction(convexApi.ai.runVote);
  const runDebate = useAction(convexApi.ai.runDebate);

  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [askDialog, setAskDialog] = useState<{ open: boolean; seed: DeepDiveUIMessage[]; target: AIProvider } | null>(null);
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; seed: DeepDiveUIMessage[] } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(DEEP_DIVE_PROVIDERS);
  const [creatingThread, setCreatingThread] = useState(false);
  const [runningVote, setRunningVote] = useState(false);
  const [runningDebate, setRunningDebate] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const activeThread = useMemo(() => {
    if (!deepDive) return null;
    if (activeThreadId) {
      const match = deepDive.threads.find(thread => thread.id === activeThreadId);
      if (match) return match;
    }
    return deepDive.threads[0] ?? null;
  }, [activeThreadId, deepDive]);

  const isLoading = Boolean(diveId) && deepDive === undefined;

  if (!diveId) return null;

  if (isLoading) {
    return (
      <div className="app-canvas min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-6">
          <div className="surface-panel rounded-[28px] px-8 py-10 text-center text-muted-foreground">
            Loading Deep Dive...
          </div>
        </div>
      </div>
    );
  }

  if (!deepDive) {
    return (
      <div className="app-canvas min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-6">
          <div className="surface-panel rounded-[28px] px-8 py-10 text-center">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Deep Dives</div>
            <div className="mt-4 text-3xl text-foreground">Deep Dive not found</div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This workspace does not exist in the database yet.
            </p>
            <Link to="/" className="mt-6 inline-flex text-sm font-medium text-foreground underline underline-offset-4">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const threadsByGroup = deepDive.threads
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .reduce<Record<string, DeepDiveThreadRecord[]>>((acc, thread) => {
      const label = groupLabel(thread.updatedAt);
      acc[label] = acc[label] ? [...acc[label], thread] : [thread];
      return acc;
    }, {});

  const participantOrder = deepDive.providers.length ? deepDive.providers : [...DEEP_DIVE_PROVIDERS];
  const defaultOther = (provider?: AIProvider) => {
    if (!provider) return participantOrder[0] ?? "gpt";
    const idx = participantOrder.indexOf(provider);
    if (idx === -1) return participantOrder[0] ?? "gpt";
    return participantOrder[(idx + 1) % participantOrder.length] ?? (participantOrder[0] ?? "gpt");
  };

  const newThread = async () => {
    if (!deepDive) return;
    setCreatingThread(true);
    try {
      const threadId = await createThread({ deepDiveId: deepDive.id, title: "New thread", type: "chat", seedMessages: [] });
      setActiveThreadId(String(threadId));
    } finally {
      setCreatingThread(false);
    }
  };

  const askOtherAI = (seedMessages: DeepDiveUIMessage[], provider?: AIProvider) => {
    const next = defaultOther(provider);
    setAskDialog({ open: true, seed: seedMessages, target: next });
  };

  const confirmAskOther = async () => {
    if (!askDialog) return;
    setCreatingThread(true);
    try {
      const threadId = await createThread({
        deepDiveId: deepDive.id,
        type: "chat",
        title: `Ask ${AI_MODELS[askDialog.target].name}: ${truncateOneLine(getMessageText(askDialog.seed[askDialog.seed.length - 1] ?? { parts: [] } as DeepDiveUIMessage))}`,
        seedMessages: askDialog.seed,
      });
      setActiveThreadId(String(threadId));
      setAskDialog(null);
    } finally {
      setCreatingThread(false);
    }
  };

  const callVote = async (seedMessages: DeepDiveUIMessage[]) => {
    const subject = truncateOneLine(getMessageText(seedMessages[seedMessages.length - 1] ?? { parts: [] } as DeepDiveUIMessage), 60);
    setCreatingThread(true);
    try {
      const threadId = await createThread({
        deepDiveId: deepDive.id,
        type: "vote",
        title: `Vote: ${subject}`,
        seedMessages,
      });
      setActiveThreadId(String(threadId));
      setRunningVote(true);
      await runVote({
        threadId: String(threadId),
        prompt: subject,
        participants: deepDive.providers,
      });
    } finally {
      setCreatingThread(false);
      setRunningVote(false);
    }
  };

  const startDebate = (seedMessages: DeepDiveUIMessage[]) => {
    setDebateParticipants(participantOrder);
    setDebateDialog({ open: true, seed: seedMessages });
  };

  const toggleDebater = (provider: AIProvider) => {
    setDebateParticipants(prev => (prev.includes(provider) ? prev.filter(x => x !== provider) : [...prev, provider]));
  };

  const confirmDebate = async () => {
    if (!debateDialog) return;
    const subject = truncateOneLine(getMessageText(debateDialog.seed[debateDialog.seed.length - 1] ?? { parts: [] } as DeepDiveUIMessage), 60);
    const participants = debateParticipants.length ? debateParticipants : participantOrder;
    setCreatingThread(true);
    try {
      const threadId = await createThread({
        deepDiveId: deepDive.id,
        type: "teamwork",
        title: `Debate: ${subject}`,
        seedMessages: debateDialog.seed,
      });
      setActiveThreadId(String(threadId));
      setDebateDialog(null);
      setRunningDebate(true);
      await runDebate({
        threadId: String(threadId),
        prompt: subject,
        participants,
      });
    } finally {
      setCreatingThread(false);
      setRunningDebate(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeThread) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setChatError(null);
    setSendingMessage(true);
    try {
      await appendUserMessage({ threadId: activeThread.id, text: trimmed });
      await sendThreadMessage({ threadId: activeThread.id });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const activeType = threadTypeCopy(activeThread?.type ?? "chat");
  const contextMessages = activeThread?.messages ?? [];
  const voteResults = activeThread?.voteResults ?? [];
  const teamworkMessages = activeThread?.teamworkMessages ?? [];
  const voteWinner = voteResults.length ? [...voteResults].sort((a, b) => b.votes.length - a.votes.length)[0] : null;

  return (
    <div className="app-canvas min-h-screen bg-background">
      <AppHeader />

      <main className="grid w-full grid-cols-[290px_minmax(0,1fr)] gap-0 pb-0 pt-0">
        <aside className="flex min-h-[calc(100vh-81px)] flex-col border-r border-border/70 bg-[rgba(250,246,240,0.78)] px-4 py-6 backdrop-blur-xl dark:bg-[rgba(14,17,24,0.9)]">
          <div className="flex items-start justify-between gap-3 px-2 pt-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Navigation</div>
              <div className="mt-2 text-xl text-foreground">Threads</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="rounded-full px-3 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={newThread}
            className="mt-5 rounded-full border-border/80 bg-white/70 dark:bg-white/[0.06]"
            disabled={creatingThread}
          >
            <MessageSquareText className="h-4 w-4" />
            New thread
          </Button>

          <div className="mt-5 flex-1 overflow-y-auto scrollbar-thin pr-1">
            {Object.entries(threadsByGroup).map(([label, threads]) => (
              <div key={label} className="mb-5">
                <div className="px-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                <div className="mt-2 space-y-2">
                  {threads.map(thread => {
                    const isActive = thread.id === activeThread?.id;
                    const meta = threadTypeCopy(thread.type);
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => setActiveThreadId(thread.id)}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          isActive
                            ? "border-border bg-white shadow-sm dark:bg-white/[0.07] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
                            : "border-transparent bg-transparent hover:border-border/70 hover:bg-white/50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="text-sm font-medium text-foreground">{thread.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{meta.label}</div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          Updated {formatDateTime(thread.updatedAt)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-81px)] flex-col bg-[rgba(255,255,255,0.42)] dark:bg-[rgba(10,12,18,0.48)]">
          <div className="border-b border-border/70 bg-[rgba(255,255,255,0.6)] px-8 py-4 backdrop-blur-xl dark:bg-[rgba(18,21,29,0.82)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Deep Dive</div>
                <h1 className="mt-2 text-[40px] leading-none text-foreground">{deepDive.title}</h1>
              </div>

              <div className="flex flex-wrap gap-2">
                {deepDive.providers.map(provider => (
                  <div
                    key={provider}
                    className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/80 px-3 py-1 text-xs dark:bg-white/[0.06]"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                    />
                    <span>{AI_MODELS[provider].name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/70 bg-[rgba(255,255,255,0.42)] px-8 py-3.5 dark:bg-[rgba(14,17,24,0.72)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{activeType.label}</div>
                  <div className="mt-1.5 text-[18px] text-foreground">{activeThread?.title ?? "Thread"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full border border-border/70 bg-white/75 px-3 py-1 text-xs text-foreground dark:bg-white/[0.06]">
                    {contextMessages.length} messages
                  </Badge>
                  {activeThread?.type !== "chat" && (
                    <Badge variant="secondary" className="rounded-full border border-border/70 bg-white/75 px-3 py-1 text-xs text-foreground dark:bg-white/[0.06]">
                      Derived from context
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {!activeThread ? null : activeThread.type === "chat" ? (
              <ThreadChatPanel
                key={activeThread.id}
                thread={activeThread}
                defaultOther={defaultOther}
                onAskOther={askOtherAI}
                onVote={callVote}
                onDebate={startDebate}
                onSend={handleSendMessage}
                isSending={sendingMessage}
                errorMessage={chatError}
              />
            ) : (
              <div className="flex-1 overflow-y-auto scrollbar-thin px-8 py-6">
                {activeThread.type === "vote" && (
                  <div className="space-y-6">
                    {contextMessages.length > 0 && (
                      <section className="rounded-[24px] border border-border/70 bg-white/55 p-4 dark:bg-white/[0.04]">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          <Scale className="h-3.5 w-3.5" />
                          Context snapshot
                        </div>
                        <div className="mt-4 space-y-3">
                          {contextMessages.map((message, idx) => {
                            const provider = message.metadata?.provider as AIProvider | undefined;
                            const model = provider ? AI_MODELS[provider] : null;
                            const text = getMessageText(message);
                            const isUser = message.role === "user";
                            return (
                              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                                <div className="max-w-[88%]">
                                  {!isUser && model && (
                                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                                      <span>{model.name}</span>
                                    </div>
                                  )}
                                  <div className={`rounded-[22px] px-4 py-3 text-sm leading-7 shadow-sm ${isUser ? "bg-[hsl(var(--user-bubble))]" : "border border-border/70 bg-white/78 dark:bg-white/[0.05]"}`}>
                                    {renderRichText(text)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <section className="space-y-4">
                      {voteResults.length === 0 && (
                        <div className="rounded-[24px] border border-border/70 bg-white/60 px-6 py-8 text-center text-sm text-muted-foreground dark:bg-white/[0.04]">
                          {runningVote ? "Gathering proposals and votes..." : "No vote results yet."}
                        </div>
                      )}

                      {voteResults.map(result => {
                        const model = AI_MODELS[result.provider];
                        const isWinner = voteWinner?.provider === result.provider;
                        const seed: DeepDiveUIMessage[] = [
                          ...contextMessages,
                          {
                            id: `vote-${activeThread.id}-${result.provider}`,
                            role: "assistant",
                            metadata: { provider: result.provider, createdAt: Date.now() },
                            parts: [{ type: "text", text: result.response }],
                          },
                        ];

                        return (
                          <div
                            key={result.provider}
                            className={`group relative rounded-[24px] border p-5 ${
                              isWinner ? "border-primary/20 bg-[rgba(255,255,255,0.88)] shadow-sm dark:bg-[rgba(34,38,47,0.92)] dark:shadow-[0_18px_44px_rgba(0,0,0,0.25)]" : "border-border/70 bg-white/68 dark:bg-white/[0.05]"
                            }`}
                          >
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-3 top-3 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label="Message actions"
                                >
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-1" align="end">
                                <Button variant="ghost" size="sm" onClick={() => askOtherAI(seed, result.provider)} className="w-full justify-start">
                                  Ask {AI_MODELS[defaultOther(result.provider)].name}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => callVote(seed)} className="w-full justify-start">
                                  Call a vote
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => startDebate(seed)} className="w-full justify-start">
                                  Start a debate
                                </Button>
                              </PopoverContent>
                            </Popover>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                                  style={{ backgroundColor: `hsl(var(--${model.color}) / 0.14)`, color: `hsl(var(--${model.color}))` }}
                                >
                                  {model.name.slice(0, 1)}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-foreground">{model.name}</div>
                                  <div className="text-xs text-muted-foreground">{result.votes.length} votes</div>
                                </div>
                              </div>
                              {isWinner && (
                                <Badge className="rounded-full bg-primary px-3 py-1 text-primary-foreground">Leading</Badge>
                              )}
                            </div>

                            <div className="mt-4 text-sm leading-7 text-foreground">{result.response}</div>

                            {result.votes.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {result.votes.map(voter => (
                                  <Badge
                                    key={voter}
                                    variant="secondary"
                                    className="rounded-full border border-border/70 bg-white/75 px-3 py-1 dark:bg-white/[0.06]"
                                    style={{ color: `hsl(var(--${AI_MODELS[voter].color}))` }}
                                  >
                                    {AI_MODELS[voter].name}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {result.reasoning && (
                              <div className="mt-4 text-xs italic leading-6 text-muted-foreground">{result.reasoning}</div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  </div>
                )}

                {activeThread.type === "teamwork" && (
                  <div className="space-y-6">
                    {contextMessages.length > 0 && (
                      <section className="rounded-[24px] border border-border/70 bg-white/55 p-4 dark:bg-white/[0.04]">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          <Users2 className="h-3.5 w-3.5" />
                          Context snapshot
                        </div>
                        <div className="mt-4 space-y-3">
                          {contextMessages.map(message => {
                            const provider = message.metadata?.provider as AIProvider | undefined;
                            const model = provider ? AI_MODELS[provider] : null;
                            const text = getMessageText(message);
                            const isUser = message.role === "user";
                            return (
                              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                                <div className="max-w-[88%]">
                                  {!isUser && model && (
                                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                                      <span>{model.name}</span>
                                    </div>
                                  )}
                                  <div className={`rounded-[22px] px-4 py-3 text-sm leading-7 shadow-sm ${isUser ? "bg-[hsl(var(--user-bubble))]" : "border border-border/70 bg-white/78 dark:bg-white/[0.05]"}`}>
                                    {renderRichText(text)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <section className="space-y-4">
                      {teamworkMessages.length === 0 && (
                        <div className="rounded-[24px] border border-border/70 bg-white/60 px-6 py-8 text-center text-sm text-muted-foreground dark:bg-white/[0.04]">
                          {runningDebate ? "The debate is underway..." : "No debate messages yet."}
                        </div>
                      )}

                      {teamworkMessages.map((message, idx) => {
                        const from = AI_MODELS[message.from];
                        const toLabel = message.to === "all" ? "everyone" : AI_MODELS[message.to as AIProvider]?.name;
                        const seed: DeepDiveUIMessage[] = [
                          ...contextMessages,
                          ...teamworkMessages.slice(0, idx + 1).map(item => ({
                            id: item.id,
                            role: "assistant" as const,
                            metadata: { provider: item.from, createdAt: item.timestamp },
                            parts: [{ type: "text", text: item.content }],
                          })),
                        ];

                        return (
                          <div key={message.id} className="group relative rounded-[24px] border border-border/70 bg-white/68 p-5 dark:bg-white/[0.05]">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-3 top-3 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label="Message actions"
                                >
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-1" align="end">
                                <Button variant="ghost" size="sm" onClick={() => askOtherAI(seed, message.from)} className="w-full justify-start">
                                  Ask {AI_MODELS[defaultOther(message.from)].name}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => callVote(seed)} className="w-full justify-start">
                                  Call a vote
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => startDebate(seed)} className="w-full justify-start">
                                  Start a debate
                                </Button>
                              </PopoverContent>
                            </Popover>

                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                                style={{ backgroundColor: `hsl(var(--${from.color}) / 0.14)`, color: `hsl(var(--${from.color}))` }}
                              >
                                {from.name.slice(0, 1)}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground">{from.name}</div>
                                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  To {toLabel}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                              {message.content}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <Dialog open={!!askDialog?.open} onOpenChange={(open) => !open && setAskDialog(null)}>
        <DialogContent className="border-border/70 bg-[rgba(255,255,255,0.92)] backdrop-blur-xl dark:bg-[rgba(18,22,30,0.94)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Ask another AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {participantOrder.map(provider => (
              <label key={provider} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">
                <Checkbox checked={askDialog?.target === provider} onCheckedChange={() => askDialog && setAskDialog({ ...askDialog, target: provider })} />
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}) / 0.14)`, color: `hsl(var(--${AI_MODELS[provider].color}))` }}
                >
                  {AI_MODELS[provider].name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{AI_MODELS[provider].name}</div>
                  <div className="truncate text-xs text-muted-foreground">{AI_MODELS[provider].fullName}</div>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAskDialog(null)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={confirmAskOther} className="rounded-full" disabled={creatingThread}>
              Ask
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!debateDialog?.open} onOpenChange={(open) => !open && setDebateDialog(null)}>
        <DialogContent className="border-border/70 bg-[rgba(255,255,255,0.92)] backdrop-blur-xl dark:bg-[rgba(18,22,30,0.94)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Start a debate</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {participantOrder.map(provider => (
              <label key={provider} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">
                <Checkbox checked={debateParticipants.includes(provider)} onCheckedChange={() => toggleDebater(provider)} />
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}) / 0.14)`, color: `hsl(var(--${AI_MODELS[provider].color}))` }}
                >
                  {AI_MODELS[provider].name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{AI_MODELS[provider].name}</div>
                  <div className="truncate text-xs text-muted-foreground">{AI_MODELS[provider].fullName}</div>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDebateDialog(null)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={confirmDebate} className="rounded-full" disabled={creatingThread || runningDebate}>
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
