import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import {
  ChevronLeft,
  MessageSquareText,
  MoreHorizontal,
  Scale,
  Trash2,
  LogOut,
  Users2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { convexApi } from "@/lib/convex-api";
import type { DeepDiveMember, DeepDiveRole, DeepDiveThreadRecord, DeepDiveUIMessage, HumanChatMessage } from "@/lib/deep-dive-types";
import { DEEP_DIVE_PROVIDERS } from "@/lib/deep-dive-types";
import { ThreadChatPanel } from "@/components/deep-dive/ThreadChatPanel";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChatInput } from "@/components/chat/ChatInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
      }}
    >
      {content}
    </ReactMarkdown>
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
  const createInvite = useConvexMutation(convexApi.deepDives.createInvite);
  const updateMemberRole = useConvexMutation(convexApi.deepDives.updateMemberRole);
  const removeMember = useConvexMutation(convexApi.deepDives.removeMember);
  const sendHumanChatMessage = useConvexMutation(convexApi.deepDives.sendHumanChatMessage);
  const deleteDeepDive = useConvexMutation(convexApi.deepDives.deleteDeepDive);
  const leaveDeepDive = useConvexMutation(convexApi.deepDives.leaveDeepDive);

  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [askDialog, setAskDialog] = useState<{ open: boolean; seed: DeepDiveUIMessage[]; target: AIProvider } | null>(null);
  const [debateDialog, setDebateDialog] = useState<{ open: boolean; seed: DeepDiveUIMessage[] } | null>(null);
  const [debateParticipants, setDebateParticipants] = useState<AIProvider[]>(DEEP_DIVE_PROVIDERS);
  const [creatingThread, setCreatingThread] = useState(false);
  const [runningVote, setRunningVote] = useState(false);
  const [runningDebate, setRunningDebate] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "commenter" | "viewer">("editor");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sendingHumanChat, setSendingHumanChat] = useState(false);
  const [humanDraft, setHumanDraft] = useState("");
  const [threadReplyTo, setThreadReplyTo] = useState<{ messageId: string; label: string; excerpt?: string } | null>(null);
  const [humanReplyTo, setHumanReplyTo] = useState<{ threadMessageId: string; label: string; excerpt?: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingDive, setDeletingDive] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [leavingDive, setLeavingDive] = useState(false);

  const activeThread = useMemo(() => {
    if (!deepDive) return null;
    if (activeThreadId) {
      const match = deepDive.threads.find(thread => thread.id === activeThreadId);
      if (match) return match;
    }
    return deepDive.threads[0] ?? null;
  }, [activeThreadId, deepDive]);

  const isLoading = Boolean(diveId) && deepDive === undefined;
  const myRole = (deepDive?.myRole ?? "viewer") as DeepDiveRole;
  const canEdit = myRole === "owner" || myRole === "editor";
  const canChat = canEdit || myRole === "commenter";
  const canComment = canChat;

  const members = useConvexQuery(
    convexApi.deepDives.listMembers,
    deepDive ? { deepDiveId: deepDive.id } : "skip",
  ) as DeepDiveMember[] | undefined;
  const invites = useConvexQuery(
    convexApi.deepDives.listInvites,
    deepDive && canEdit ? { deepDiveId: deepDive.id } : "skip",
  ) as Array<{ token: string; email: string | null; role: "editor" | "commenter" | "viewer"; createdAt: number; expiresAt: number | null }> | undefined;
  const humanMessages = useConvexQuery(
    convexApi.deepDives.listHumanChatMessages,
    deepDive ? { deepDiveId: deepDive.id } : "skip",
  ) as HumanChatMessage[] | undefined;

  const humanEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    humanEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [humanMessages?.length]);

  const inviteLink = useMemo(() => {
    if (!inviteToken) return "";
    return `${window.location.origin}/invite/${inviteToken}`;
  }, [inviteToken]);

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

  const createLinkInvite = async () => {
    setInviteError(null);
    try {
      const result = await createInvite({ deepDiveId: deepDive.id, role: inviteRole });
      setInviteToken(result.token);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Failed to create invite");
    }
  };

  const createEmailInvite = async () => {
    const email = inviteEmailInput.trim();
    if (!email) return;
    setInviteError(null);
    try {
      const result = await createInvite({ deepDiveId: deepDive.id, role: inviteRole, email });
      setInviteToken(result.token);
      setInviteEmailInput("");
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Failed to create invite");
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
  };

  const confirmDeleteDeepDive = async () => {
    if (myRole !== "owner") return;
    setDeleteError(null);
    setDeletingDive(true);
    try {
      await deleteDeepDive({ deepDiveId: deepDive.id });
      navigate("/", { replace: true });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete Deep Dive");
    } finally {
      setDeletingDive(false);
    }
  };

  const updateRole = async (memberUserId: string, role: "editor" | "commenter" | "viewer") => {
    await updateMemberRole({ deepDiveId: deepDive.id, memberUserId, role });
  };

  const kickMember = async (memberUserId: string) => {
    await removeMember({ deepDiveId: deepDive.id, memberUserId });
  };

  const jumpToThreadMessage = (messageId: string) => {
    const el = document.getElementById(`thread-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/40", "rounded-[26px]");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary/40", "rounded-[26px]");
    }, 900);
  };

  const sendHumanMessage = async (text: string) => {
    if (!canComment) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setSendingHumanChat(true);
    try {
      await sendHumanChatMessage({
        deepDiveId: deepDive.id,
        text: trimmed,
        replyToThreadMessageId: humanReplyTo?.threadMessageId,
        replyToExcerpt: humanReplyTo?.excerpt,
      });
      setHumanDraft("");
      setHumanReplyTo(null);
    } finally {
      setSendingHumanChat(false);
    }
  };

  const replyToMessage = (message: DeepDiveUIMessage) => {
    const provider = message.metadata?.provider as AIProvider | undefined;
    const providerName = provider ? AI_MODELS[provider].name : "AI";
    const full = getMessageText(message);
    const excerpt = full.length > 240 ? `${full.slice(0, 239)}…` : full;
    setThreadReplyTo({
      messageId: message.id,
      label: `${providerName}: ${excerpt}`,
      excerpt,
    });
  };

  const replyInHumanChat = (message: DeepDiveUIMessage) => {
    const provider = message.metadata?.provider as AIProvider | undefined;
    const providerName = provider ? AI_MODELS[provider].name : "AI";
    const full = getMessageText(message);
    const excerpt = full.length > 240 ? `${full.slice(0, 239)}…` : full;
    setHumanReplyTo({
      threadMessageId: message.id,
      label: `${providerName}: ${excerpt}`,
      excerpt,
    });
  };

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
    if (!canEdit) return;
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
    if (!canChat) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setChatError(null);
    setSendingMessage(true);
    try {
      await appendUserMessage({
        threadId: activeThread.id,
        text: trimmed,
        replyToMessageId: threadReplyTo?.messageId,
        replyToExcerpt: threadReplyTo?.excerpt,
      });
      await sendThreadMessage({ threadId: activeThread.id });
      setThreadReplyTo(null);
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

      <main className="grid h-[calc(100vh-81px)] w-full grid-cols-[290px_minmax(0,1fr)_320px] gap-0 overflow-hidden pb-0 pt-0">
        <aside className="flex h-full min-h-0 flex-col border-r border-border/70 bg-[rgba(250,246,240,0.78)] px-4 py-6 backdrop-blur-xl dark:bg-[rgba(14,17,24,0.9)]">
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
            disabled={creatingThread || !canEdit}
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

        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[rgba(255,255,255,0.42)] dark:bg-[rgba(10,12,18,0.48)]">
          <div className="border-b border-border/70 bg-[rgba(255,255,255,0.6)] px-8 py-4 backdrop-blur-xl dark:bg-[rgba(18,21,29,0.82)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Deep Dive</div>
                <h1 className="mt-2 text-[40px] leading-none text-foreground">{deepDive.title}</h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShareOpen(true)}>
                  <Users2 className="h-4 w-4" />
                  Share
                </Button>
                {myRole !== "owner" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={leavingDive}
                    onClick={() => {
                      if (!deepDive) return;
                      void (async () => {
                        setLeavingDive(true);
                        try {
                          await leaveDeepDive({ deepDiveId: deepDive.id });
                          navigate("/", { replace: true });
                        } finally {
                          setLeavingDive(false);
                        }
                      })();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Exit
                  </Button>
                ) : null}
                {myRole === "owner" ? (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
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
                canSend={canChat}
                canUseTools={canEdit}
                onReplyToMessage={replyToMessage}
                onReplyInHumanChat={replyInHumanChat}
                replyTo={threadReplyTo ? { messageId: threadReplyTo.messageId, label: threadReplyTo.label } : null}
                onCancelReply={() => setThreadReplyTo(null)}
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
                                    {renderMarkdown(text)}
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
                                    {renderMarkdown(text)}
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

        <aside className="flex h-full min-h-0 flex-col border-l border-border/70 bg-[rgba(250,246,240,0.78)] px-4 py-6 backdrop-blur-xl dark:bg-[rgba(14,17,24,0.9)]">
          <div className="px-2 pt-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Humans</div>
            <div className="mt-2 text-xl text-foreground">Team chat</div>
            <div className="mt-2 text-xs text-muted-foreground">Access: {myRole}</div>
          </div>

          <div className="mt-5 flex-1 overflow-y-auto scrollbar-thin pr-1">
            <div className="space-y-3 px-2">
              {(humanMessages ?? []).map((message) => (
                <div key={message.id} className="rounded-2xl border border-border/70 bg-white/70 px-3 py-3 text-sm dark:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={message.author.image} />
                        <AvatarFallback className="text-[10px]">
                          {initials((message.author.name || message.author.email || "Member").toString())}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {(message.author.name || message.author.email || "Member").toString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{formatDateTime(message.createdAt)}</div>
                  </div>

                  {message.replyTo?.threadMessageId ? (
                    <button
                      type="button"
                      onClick={() => jumpToThreadMessage(message.replyTo!.threadMessageId)}
                      className="mt-3 w-full rounded-[18px] border border-border/70 bg-white/60 px-3 py-2 text-left text-xs dark:bg-white/[0.03]"
                    >
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">In reply to</div>
                      <div className="mt-1 truncate text-foreground">{message.replyTo.excerpt || "View message"}</div>
                    </button>
                  ) : null}

                  <div className="mt-3 break-words text-foreground">{renderMarkdown(message.text)}</div>
                </div>
              ))}
              <div ref={humanEndRef} />
            </div>
          </div>

          <div className="mt-4 border-t border-border/70 pt-4">
            <ChatInput
              onSend={sendHumanMessage}
              placeholder={canComment ? "Message your team..." : "View-only"}
              disabled={sendingHumanChat || !canComment}
              autoFocus={false}
              value={humanDraft}
              onChange={setHumanDraft}
              reply={
                humanReplyTo
                  ? {
                      label: humanReplyTo.label,
                      onClick: () => jumpToThreadMessage(humanReplyTo.threadMessageId),
                      onCancel: () => setHumanReplyTo(null),
                    }
                  : null
              }
            />
          </div>
        </aside>
      </main>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="border-border/70 bg-[rgba(255,255,255,0.92)] backdrop-blur-xl dark:bg-[rgba(18,22,30,0.94)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Share & access</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="rounded-[22px] border border-border/70 bg-white/70 p-4 dark:bg-white/[0.05]">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Invite</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
                <Input
                  value={inviteEmailInput}
                  onChange={(e) => setInviteEmailInput(e.target.value)}
                  placeholder="Gmail (or any email)"
                  className="rounded-full bg-white/80 dark:bg-white/[0.05]"
                  disabled={!canEdit}
                />
                <Select
                  value={inviteRole}
                  onValueChange={(value) => {
                    if (value === "editor" || value === "commenter" || value === "viewer") {
                      setInviteRole(value);
                    }
                  }}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="rounded-full">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="commenter">Commenter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button onClick={createEmailInvite} className="rounded-full" disabled={!canEdit || inviteEmailInput.trim().length === 0}>
                  Create email invite
                </Button>
                <Button onClick={createLinkInvite} variant="outline" className="rounded-full" disabled={!canEdit}>
                  Create link invite
                </Button>
              </div>

              {inviteError ? (
                <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {inviteError}
                </div>
              ) : null}

              {inviteToken ? (
                <div className="mt-4 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 dark:bg-white/[0.04]">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Invite link</div>
                  <div className="mt-2 break-all text-sm text-foreground">{inviteLink}</div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyInvite} className="rounded-full">
                      Copy link
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[22px] border border-border/70 bg-white/70 p-4 dark:bg-white/[0.05]">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Members</div>
              <div className="mt-4 space-y-2">
                {(members ?? []).map((member) => (
                  <div key={member.userId} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{member.name || member.email || member.userId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{member.email || ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full bg-white/75 dark:bg-white/[0.06]">{member.role}</Badge>
                      {myRole === "owner" && member.role !== "owner" ? (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              if (value === "editor" || value === "commenter" || value === "viewer") {
                                void updateRole(member.userId, value);
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 w-[140px] rounded-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="commenter">Commenter</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => void kickMember(member.userId)}>
                            Remove
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {canEdit ? (
              <div className="rounded-[22px] border border-border/70 bg-white/70 p-4 dark:bg-white/[0.05]">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Active invites</div>
                <div className="mt-4 space-y-2">
                  {(invites ?? []).map((invite) => {
                    const link = `${window.location.origin}/invite/${invite.token}`;
                    return (
                      <div key={invite.token} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{invite.email || "Link invite"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{invite.role}</div>
                          <div className="mt-2 break-all text-xs text-muted-foreground">{link}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigator.clipboard.writeText(link)}>
                            Copy
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {(invites ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No active invites.</div> : null}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)} className="rounded-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-border/70 bg-[rgba(255,255,255,0.92)] backdrop-blur-xl dark:bg-[rgba(18,22,30,0.94)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Delete Deep Dive</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>This permanently deletes the Deep Dive, threads, uploads, invites, members, and human chat.</div>
            <div className="font-medium text-foreground">{deepDive.title}</div>
            {deleteError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {deleteError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-full" disabled={deletingDive}>
              Cancel
            </Button>
            <Button onClick={confirmDeleteDeepDive} className="rounded-full" disabled={deletingDive}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
