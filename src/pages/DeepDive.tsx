import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import {
  ChevronLeft,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  PanelRightClose,
  PencilLine,
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
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppHeader } from "@/components/layout/AppHeader";
import { usePersistedBoolean } from "@/hooks/usePersistedBoolean";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
          <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc pl-6 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-6 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary/30 pl-3 italic text-muted-foreground">{children}</blockquote>,
        code: ({ children, className }) => (
          <code className={`rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] ${className ?? ""}`}>
            {children}
          </code>
        ),
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-xl bg-muted p-3">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function threadTypeCopy(type: DeepDiveThreadRecord["type"]) {
  if (type === "vote") return { label: "Vote", detail: "Models propose options, then score the strongest direction." };
  if (type === "teamwork") return { label: "Debate", detail: "Models challenge, refine, and synthesize ideas." };
  return { label: "Thread", detail: "Direct conversation with shared context." };
}

function formatDateTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ts);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

export default function DeepDive() {
  const navigate = useNavigate();
  const { diveId } = useParams();
  const deepDive = useConvexQuery(convexApi.deepDives.get, diveId ? { diveId } : "skip");
  const createThread = useConvexMutation(convexApi.deepDives.createThread);
  const updateThreadTitle = useConvexMutation(convexApi.deepDives.updateThreadTitle);
  const deleteThread = useConvexMutation(convexApi.deepDives.deleteThread);
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
  const [renameThreadOpen, setRenameThreadOpen] = useState(false);
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [renameThreadTitle, setRenameThreadTitle] = useState("");
  const [renameThreadError, setRenameThreadError] = useState<string | null>(null);
  const [savingThreadTitle, setSavingThreadTitle] = useState(false);
  const [threadDeleteTarget, setThreadDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);
  const [threadDeleteError, setThreadDeleteError] = useState<string | null>(null);
  const [threadsOpen, setThreadsOpen] = usePersistedBoolean("oryx.deepDive.threads", false);
  const [notesOpen, setNotesOpen] = usePersistedBoolean("oryx.deepDive.notes", false);

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

  useEffect(() => {
    if (!deepDive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = e.metaKey || e.ctrlKey;
      if (!primary || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setNotesOpen((open) => !open);
        return;
      }
      if (e.key === "." || e.code === "Period") {
        e.preventDefault();
        setThreadsOpen((open) => !open);
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deepDive, setNotesOpen, setThreadsOpen]);

  const inviteLink = useMemo(() => {
    if (!inviteToken) return "";
    return `${window.location.origin}/invite/${inviteToken}`;
  }, [inviteToken]);

  if (!diveId) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 animate-fade-up">
          <BrandLogo gradient showLabel={false} />
          <p className="text-sm text-muted-foreground animate-pulse">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!deepDive) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-6">
          <div className="text-center animate-fade-up">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Projects</p>
            <h1 className="mt-3 text-2xl font-display text-foreground">Project not found</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This project does not exist or you don't have access.
            </p>
            <Link to="/" className="mt-6 inline-flex text-sm font-medium text-primary hover:text-primary/80">
              Back to projects
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
      setDeleteError(e instanceof Error ? e.message : "Failed to delete project");
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
    el.classList.add("ring-1", "ring-primary/30", "rounded-xl");
    window.setTimeout(() => {
      el.classList.remove("ring-1", "ring-primary/30", "rounded-xl");
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

  const openRenameThread = (thread: DeepDiveThreadRecord) => {
    setRenameThreadId(thread.id);
    setRenameThreadTitle(thread.title);
    setRenameThreadError(null);
    setRenameThreadOpen(true);
  };

  const submitRenameThread = async () => {
    if (!renameThreadId) return;
    setRenameThreadError(null);
    setSavingThreadTitle(true);
    try {
      await updateThreadTitle({ threadId: renameThreadId, title: renameThreadTitle });
      setRenameThreadOpen(false);
      setRenameThreadId(null);
      setRenameThreadTitle("");
    } catch (error) {
      setRenameThreadError(error instanceof Error ? error.message : "Failed to rename thread");
    } finally {
      setSavingThreadTitle(false);
    }
  };

  const confirmDeleteThread = async () => {
    if (!threadDeleteTarget || !deepDive) return;
    setThreadDeleteError(null);
    setDeletingThread(true);
    try {
      await deleteThread({ threadId: threadDeleteTarget.id });
      if (activeThread?.id === threadDeleteTarget.id) {
        const fallback = deepDive.threads
          .filter((thread) => thread.id !== threadDeleteTarget.id)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setActiveThreadId(fallback?.id ?? "");
      }
      setThreadDeleteTarget(null);
    } catch (error) {
      setThreadDeleteError(error instanceof Error ? error.message : "Failed to delete thread");
    } finally {
      setDeletingThread(false);
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
  const threadCount = deepDive.threads.length;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <AppHeader
        workspace={{
          leading: (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                  aria-label="All projects"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="transition-opacity hover:opacity-70"
                  aria-label="Home"
                >
                  <BrandLogo compact showLabel={false} className="gap-0" />
                </button>
              </div>
              <div className="hidden h-5 w-px bg-border/50 sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{deepDive.title}</span>
                  <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {activeType.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{activeThread?.title ?? "Thread"}</p>
              </div>
              <div className="hidden shrink-0 items-center gap-1 lg:flex">
                {deepDive.providers.map((provider) => (
                  <span
                    key={provider}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                  />
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                  {contextMessages.length} msgs
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                      aria-label="Project menu"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setShareOpen(true)}>
                      <Users2 className="mr-2 h-4 w-4" />
                      Share project
                    </DropdownMenuItem>
                    {myRole !== "owner" ? (
                      <DropdownMenuItem
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
                        <LogOut className="mr-2 h-4 w-4" />
                        Leave project
                      </DropdownMenuItem>
                    ) : null}
                    {myRole === "owner" ? (
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete project
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ),
          beforeSystemControls: (
            <>
              <button
                type="button"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  threadsOpen ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                aria-label={threadsOpen ? "Hide threads" : "Show threads"}
                onClick={() => setThreadsOpen((o) => !o)}
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  notesOpen ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                aria-label={notesOpen ? "Hide notes" : "Show notes"}
                onClick={() => setNotesOpen((o) => !o)}
              >
                {notesOpen ? <PanelRightClose className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </button>
            </>
          ),
        }}
      />

      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Threads sidebar */}
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-border/40 bg-card/50 transition-[width,border-color] duration-200 ease-out",
            threadsOpen ? "border-r" : "border-transparent",
          )}
          style={{ width: threadsOpen ? "min(272px, 90vw)" : 0 }}
        >
          <div className="flex min-h-0 w-[272px] min-w-[272px] flex-1 flex-col px-3 pb-3 pt-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Threads</p>
              <span className="text-xs tabular-nums text-muted-foreground">{threadCount}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={newThread}
              className="mt-3 w-full justify-start gap-2 border-border/40 text-xs"
              disabled={creatingThread || !canEdit}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              New thread
            </Button>

            <div className="mt-2 flex items-center gap-2 rounded-lg bg-accent/40 px-3 py-2">
              <div className="flex items-center gap-1">
                {deepDive.providers.map((provider) => (
                  <span
                    key={provider}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                  />
                ))}
              </div>
              <span className="text-[11px] capitalize text-muted-foreground">{myRole}</span>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1">
            {Object.entries(threadsByGroup).map(([label, threads]) => (
              <div key={label} className="mb-4">
                <p className="px-1 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                <div className="mt-1.5 space-y-1">
                  {threads.map(thread => {
                    const isActive = thread.id === activeThread?.id;
                    const meta = threadTypeCopy(thread.type);
                    return (
                      <div
                        key={thread.id}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 transition-colors",
                          isActive
                            ? "border-border/60 bg-accent"
                            : "border-transparent hover:bg-accent/50"
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveThreadId(thread.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-sm font-medium text-foreground">{thread.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.label} · {formatDateTime(thread.updatedAt)}</p>
                          </button>
                          {canEdit ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 [div:hover>&]:opacity-100"
                                  aria-label="Thread actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => openRenameThread(thread)}>
                                  <PencilLine className="mr-2 h-4 w-4" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setThreadDeleteError(null);
                                    setThreadDeleteTarget({ id: thread.id, title: thread.title });
                                  }}
                                  disabled={threadCount <= 1}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
        </aside>

        {/* Main content */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden bg-background">
          <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-none flex-1 flex-col">
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
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-3xl">
                {activeThread.type === "vote" && (
                  <div className="space-y-6">
                    {contextMessages.length > 0 && (
                      <section className="rounded-xl border border-border/40 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Scale className="h-3.5 w-3.5" />
                          <span className="uppercase tracking-widest">Context snapshot</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {contextMessages.map((message) => {
                            const provider = message.metadata?.provider as AIProvider | undefined;
                            const model = provider ? AI_MODELS[provider] : null;
                            const text = getMessageText(message);
                            const isUser = message.role === "user";
                            return (
                              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                                <div className="max-w-[88%]">
                                  {!isUser && model && (
                                    <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                                      <span className="font-medium">{model.name}</span>
                                    </div>
                                  )}
                                  <div className={cn(
                                    "rounded-xl px-4 py-3 text-sm leading-relaxed",
                                    isUser ? "bg-[hsl(var(--user-bubble))]" : "bg-accent/50"
                                  )}>
                                    {renderMarkdown(text)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <section className="space-y-3">
                      {voteResults.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/50 px-6 py-10 text-center text-sm text-muted-foreground">
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
                            className={cn(
                              "group relative rounded-xl border p-5",
                              isWinner ? "border-primary/30 bg-primary/5" : "border-border/40 bg-card"
                            )}
                          >
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-3 top-3 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label="Message actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-1" align="end">
                                <Button variant="ghost" size="sm" onClick={() => askOtherAI(seed, result.provider)} className="w-full justify-start text-xs">
                                  Ask {AI_MODELS[defaultOther(result.provider)].name}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => callVote(seed)} className="w-full justify-start text-xs">
                                  Call a vote
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => startDebate(seed)} className="w-full justify-start text-xs">
                                  Start a debate
                                </Button>
                              </PopoverContent>
                            </Popover>

                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold"
                                style={{ backgroundColor: `hsl(var(--${model.color}) / 0.12)`, color: `hsl(var(--${model.color}))` }}
                              >
                                {model.name.slice(0, 1)}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">{model.name}</p>
                                <p className="text-xs text-muted-foreground">{result.votes.length} votes</p>
                              </div>
                              {isWinner && (
                                <Badge className="bg-primary/15 text-primary border-0 text-xs">Leading</Badge>
                              )}
                            </div>

                            <div className="mt-3 text-sm leading-relaxed text-foreground">{result.response}</div>

                            {result.votes.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {result.votes.map(voter => (
                                  <Badge
                                    key={voter}
                                    variant="secondary"
                                    className="border-0 bg-accent text-xs"
                                    style={{ color: `hsl(var(--${AI_MODELS[voter].color}))` }}
                                  >
                                    {AI_MODELS[voter].name}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {result.reasoning && (
                              <p className="mt-3 text-xs italic text-muted-foreground">{result.reasoning}</p>
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
                      <section className="rounded-xl border border-border/40 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users2 className="h-3.5 w-3.5" />
                          <span className="uppercase tracking-widest">Context snapshot</span>
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
                                    <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                                      <span className="font-medium">{model.name}</span>
                                    </div>
                                  )}
                                  <div className={cn(
                                    "rounded-xl px-4 py-3 text-sm leading-relaxed",
                                    isUser ? "bg-[hsl(var(--user-bubble))]" : "bg-accent/50"
                                  )}>
                                    {renderMarkdown(text)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <section className="space-y-3">
                      {teamworkMessages.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/50 px-6 py-10 text-center text-sm text-muted-foreground">
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
                          <div key={message.id} className="group relative rounded-xl border border-border/40 bg-card p-5">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-3 top-3 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label="Message actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-1" align="end">
                                <Button variant="ghost" size="sm" onClick={() => askOtherAI(seed, message.from)} className="w-full justify-start text-xs">
                                  Ask {AI_MODELS[defaultOther(message.from)].name}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => callVote(seed)} className="w-full justify-start text-xs">
                                  Call a vote
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => startDebate(seed)} className="w-full justify-start text-xs">
                                  Start a debate
                                </Button>
                              </PopoverContent>
                            </Popover>

                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold"
                                style={{ backgroundColor: `hsl(var(--${from.color}) / 0.12)`, color: `hsl(var(--${from.color}))` }}
                              >
                                {from.name.slice(0, 1)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{from.name}</p>
                                <p className="text-xs text-muted-foreground">To {toLabel}</p>
                              </div>
                            </div>

                            <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                              {message.content}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Notes sidebar */}
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-border/40 bg-card/50 transition-[width,border-color] duration-200 ease-out",
            notesOpen ? "border-l" : "border-transparent",
          )}
          style={{ width: notesOpen ? "min(280px, 90vw)" : 0 }}
        >
          <div className="flex min-h-0 w-[280px] min-w-[280px] flex-1 flex-col px-3 pb-3 pt-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Team notes</p>
              <span className="text-[11px] capitalize text-muted-foreground">{myRole}</span>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1">
            <div className="space-y-2">
              {(humanMessages ?? []).map((message) => (
                <div key={message.id} className="rounded-lg border border-border/40 bg-card p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={message.author.image} />
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                          {initials((message.author.name || message.author.email || "Member").toString())}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-xs font-medium text-foreground">
                        {(message.author.name || message.author.email || "Member").toString()}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(message.createdAt)}</span>
                  </div>

                  {message.replyTo?.threadMessageId ? (
                    <button
                      type="button"
                      onClick={() => jumpToThreadMessage(message.replyTo!.threadMessageId)}
                      className="mt-2 w-full rounded-lg bg-accent/50 px-2.5 py-1.5 text-left text-xs"
                    >
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">In reply to</p>
                      <p className="mt-0.5 truncate text-foreground">{message.replyTo.excerpt || "View message"}</p>
                    </button>
                  ) : null}

                  <div className="mt-2 break-words text-foreground">{renderMarkdown(message.text)}</div>
                </div>
              ))}
              <div ref={humanEndRef} />
            </div>
          </div>

          <div className="mt-auto shrink-0 border-t border-border/40 pt-3">
            <ChatInput
              onSend={sendHumanMessage}
              placeholder={canComment ? "Add a note..." : "View-only"}
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
          </div>
        </aside>
      </main>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="border-border/50 bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Project access</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3 rounded-xl border border-border/40 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Invite people</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={inviteEmailInput}
                  onChange={(e) => setInviteEmailInput(e.target.value)}
                  placeholder="Email address"
                  disabled={!canEdit}
                  className="flex-1"
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
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="commenter">Commenter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createEmailInvite} disabled={!canEdit || inviteEmailInput.trim().length === 0}>
                  Email invite
                </Button>
                <Button size="sm" variant="outline" onClick={createLinkInvite} disabled={!canEdit}>
                  Link invite
                </Button>
              </div>
              {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
              {inviteToken ? (
                <div className="rounded-lg bg-accent/50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Invite link</p>
                  <p className="mt-1 break-all text-xs text-foreground">{inviteLink}</p>
                  <Button variant="ghost" size="sm" onClick={copyInvite} className="mt-1 h-7 px-2 text-xs">
                    Copy
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-xl border border-border/40 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Members</p>
              {(members ?? []).map((member) => (
                <div key={member.userId} className="flex items-center justify-between gap-3 rounded-lg bg-accent/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{member.name || member.email || member.userId}</p>
                    {member.email ? <p className="text-xs text-muted-foreground">{member.email}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs border-0">{member.role}</Badge>
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
                          <SelectTrigger className="h-8 w-[120px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="commenter">Commenter</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void kickMember(member.userId)}>
                          Remove
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {canEdit ? (
              <div className="space-y-2 rounded-xl border border-border/40 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Active invites</p>
                {(invites ?? []).map((invite) => {
                  const link = `${window.location.origin}/invite/${invite.token}`;
                  return (
                    <div key={invite.token} className="flex items-center justify-between gap-3 rounded-lg bg-accent/30 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{invite.email || "Link invite"}</p>
                        <p className="text-xs text-muted-foreground">{invite.role}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigator.clipboard.writeText(link)}>
                        Copy
                      </Button>
                    </div>
                  );
                })}
                {(invites ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No active invites.</p> : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShareOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete project dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Delete project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>This permanently deletes the project, threads, uploads, invites, members, and notes.</p>
            <p className="font-medium text-foreground">{deepDive.title}</p>
            {deleteError ? <p className="text-destructive">{deleteError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deletingDive}>Cancel</Button>
            <Button onClick={confirmDeleteDeepDive} disabled={deletingDive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename thread */}
      <Dialog
        open={renameThreadOpen}
        onOpenChange={(open) => {
          setRenameThreadOpen(open);
          if (!open) {
            setRenameThreadId(null);
            setRenameThreadTitle("");
            setRenameThreadError(null);
          }
        }}
      >
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Rename thread</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameThreadTitle}
              onChange={(event) => setRenameThreadTitle(event.target.value)}
              placeholder="Thread title"
            />
            {renameThreadError ? <p className="text-sm text-destructive">{renameThreadError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRenameThreadOpen(false)} disabled={savingThreadTitle}>Cancel</Button>
            <Button onClick={() => void submitRenameThread()} disabled={savingThreadTitle || !renameThreadTitle.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete thread */}
      <AlertDialog
        open={threadDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setThreadDeleteTarget(null);
            setThreadDeleteError(null);
          }
        }}
      >
        <AlertDialogContent className="border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the thread and all of its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-foreground">{threadDeleteTarget?.title}</p>
            {threadCount <= 1 ? <p className="text-muted-foreground">Projects must keep at least one thread.</p> : null}
            {threadDeleteError ? <p className="text-destructive">{threadDeleteError}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingThread}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteThread();
              }}
              disabled={deletingThread || threadCount <= 1}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ask another model */}
      <Dialog open={!!askDialog?.open} onOpenChange={(open) => !open && setAskDialog(null)}>
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Ask another model</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {participantOrder.map(provider => (
              <label key={provider} className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 transition-colors hover:bg-accent/50 cursor-pointer">
                <Checkbox checked={askDialog?.target === provider} onCheckedChange={() => askDialog && setAskDialog({ ...askDialog, target: provider })} />
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}) / 0.12)`, color: `hsl(var(--${AI_MODELS[provider].color}))` }}
                >
                  {AI_MODELS[provider].name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{AI_MODELS[provider].name}</p>
                  <p className="truncate text-xs text-muted-foreground">{AI_MODELS[provider].fullName}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAskDialog(null)}>Cancel</Button>
            <Button onClick={confirmAskOther} disabled={creatingThread}>Ask</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debate */}
      <Dialog open={!!debateDialog?.open} onOpenChange={(open) => !open && setDebateDialog(null)}>
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Start a debate</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {participantOrder.map(provider => (
              <label key={provider} className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 transition-colors hover:bg-accent/50 cursor-pointer">
                <Checkbox checked={debateParticipants.includes(provider)} onCheckedChange={() => toggleDebater(provider)} />
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}) / 0.12)`, color: `hsl(var(--${AI_MODELS[provider].color}))` }}
                >
                  {AI_MODELS[provider].name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{AI_MODELS[provider].name}</p>
                  <p className="truncate text-xs text-muted-foreground">{AI_MODELS[provider].fullName}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDebateDialog(null)}>Cancel</Button>
            <Button onClick={confirmDebate} disabled={creatingThread || runningDebate}>Start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
