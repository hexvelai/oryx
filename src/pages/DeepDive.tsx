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
import { Separator } from "@/components/ui/separator";
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
  if (type === "vote") return { label: "Vote", detail: "Multiple models propose options, then score the strongest direction." };
  if (type === "teamwork") return { label: "Debate", detail: "Models challenge, refine, and synthesize ideas in sequence." };
  return { label: "Thread", detail: "A direct conversation with shared project context and model routing." };
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
      <div className="app-canvas min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-6">
          <div className="surface-panel rounded-[28px] px-8 py-10 text-center text-muted-foreground">
            Loading project...
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
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Projects</div>
            <div className="mt-4 text-3xl text-foreground">Project not found</div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This project does not exist in the database yet.
            </p>
            <Link to="/" className="mt-6 inline-flex text-sm font-medium text-foreground underline underline-offset-4">
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
    <div className="app-canvas flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <AppHeader
        workspace={{
          leading: (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  onClick={() => navigate("/")}
                  aria-label="All projects"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="shrink-0 rounded-lg p-0.5 transition-colors hover:bg-muted/70"
                  aria-label="Home"
                >
                  <BrandLogo compact showLabel={false} className="gap-0" />
                </button>
                <Separator orientation="vertical" className="hidden h-6 sm:block" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium leading-tight text-foreground">{deepDive.title}</div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 rounded-md border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-background/25">
                    {activeType.label}
                  </span>
                  <span className="min-w-0 truncate text-xs font-semibold text-foreground sm:text-sm">
                    {activeThread?.title ?? "Thread"}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">{activeType.detail}</p>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 lg:flex" title="Models in this project">
                {deepDive.providers.map((provider) => (
                  <span
                    key={provider}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                  />
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className="inline-flex max-w-[9rem] shrink-0 truncate rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-normal tabular-nums text-foreground sm:max-w-none"
                >
                  {contextMessages.length} in context
                </Badge>
                {activeThread?.type !== "chat" ? (
                  <Badge variant="outline" className="hidden rounded-md px-2 py-0.5 text-[10px] font-normal sm:inline-flex">
                    Branched
                  </Badge>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border/70" aria-label="Project menu">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
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
              <Button
                type="button"
                variant={threadsOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-pressed={threadsOpen}
                aria-expanded={threadsOpen}
                aria-label={threadsOpen ? "Hide threads" : "Show threads"}
                title="Toggle threads (⌘. or Ctrl+.)"
                onClick={() => setThreadsOpen((o) => !o)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={notesOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-pressed={notesOpen}
                aria-expanded={notesOpen}
                aria-label={notesOpen ? "Hide team notes" : "Show team notes"}
                title="Toggle team notes (⌘B or Ctrl+B)"
                onClick={() => setNotesOpen((o) => !o)}
              >
                {notesOpen ? <PanelRightClose className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </Button>
            </>
          ),
        }}
      />

      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-border/60 bg-muted/40 transition-[width,border-color] duration-200 ease-out dark:bg-muted/25",
            threadsOpen ? "border-r" : "border-transparent",
          )}
          style={{ width: threadsOpen ? "min(288px, 92vw)" : 0 }}
        >
          <div className="flex min-h-0 w-[288px] min-w-[288px] flex-1 flex-col px-3 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Threads</div>
              <span className="text-xs tabular-nums text-muted-foreground">{threadCount}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={newThread}
              className="mt-3 rounded-full border-border/80 bg-white/70 text-xs dark:bg-white/[0.06]"
              disabled={creatingThread || !canEdit}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              New thread
            </Button>

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-white/60 px-3 py-2 dark:bg-white/[0.04]">
              <div className="flex items-center gap-1.5" title="Models in this project">
                {deepDive.providers.map((provider) => (
                  <span
                    key={provider}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                  />
                ))}
              </div>
              <span className="text-[11px] capitalize text-muted-foreground">{myRole}</span>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1">
            {Object.entries(threadsByGroup).map(([label, threads]) => (
              <div key={label} className="mb-5">
                <div className="px-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                <div className="mt-2 space-y-2">
                  {threads.map(thread => {
                    const isActive = thread.id === activeThread?.id;
                    const meta = threadTypeCopy(thread.type);
                    return (
                      <div
                        key={thread.id}
                        className={`rounded-2xl border px-3 py-3 transition ${
                          isActive
                            ? "border-border bg-white shadow-sm dark:bg-white/[0.07] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
                            : "border-transparent bg-transparent hover:border-border/70 hover:bg-white/50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveThreadId(thread.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="text-sm font-medium text-foreground">{thread.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{meta.label}</div>
                            <div className="mt-3 text-xs text-muted-foreground">
                              Updated {formatDateTime(thread.updatedAt)}
                            </div>
                          </button>
                          {canEdit ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                                  aria-label="Thread actions"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => openRenameThread(thread)}>
                                  <PencilLine className="mr-2 h-4 w-4" />
                                  Rename thread
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
                                  Delete thread
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

        <section className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden bg-background">
          <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[min(100%,72rem)] flex-1 flex-col">
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
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4 sm:px-5">
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
                              isWinner ? "border-primary/30 bg-card shadow-sm" : "border-border/70 bg-muted/40 dark:bg-muted/20"
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

        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-border/60 bg-muted/40 transition-[width,border-color] duration-200 ease-out dark:bg-muted/25",
            notesOpen ? "border-l" : "border-transparent",
          )}
          style={{ width: notesOpen ? "min(300px, 92vw)" : 0 }}
        >
          <div className="flex min-h-0 w-[300px] min-w-[300px] flex-1 flex-col px-3 pb-3 pt-3">
            <div className="flex items-start justify-between gap-2 px-1">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Team notes</div>
                <div className="mt-0.5 text-xs text-muted-foreground">People · {myRole}</div>
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1">
            <div className="space-y-3 px-0.5">
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

          <div className="mt-auto shrink-0 border-t border-border/60 pt-3">
            <ChatInput
              onSend={sendHumanMessage}
              placeholder={canComment ? "Add a note for the team..." : "View-only"}
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

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="border-border bg-background sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Project access</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="rounded-[22px] border border-border/70 bg-white/70 p-4 dark:bg-white/[0.05]">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Invite people</div>
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
        <DialogContent className="border-border bg-background sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Delete project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>This permanently deletes the project, its threads, uploads, invites, members, and project notes.</div>
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
        <DialogContent className="border-border bg-background sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Rename thread</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameThreadTitle}
              onChange={(event) => setRenameThreadTitle(event.target.value)}
              placeholder="Thread title"
              className="rounded-2xl bg-white/80 dark:bg-white/[0.05]"
            />
            {renameThreadError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {renameThreadError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRenameThreadOpen(false)} className="rounded-full" disabled={savingThreadTitle}>
              Cancel
            </Button>
            <Button onClick={() => void submitRenameThread()} className="rounded-full" disabled={savingThreadTitle || !renameThreadTitle.trim()}>
              Save title
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={threadDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setThreadDeleteTarget(null);
            setThreadDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the thread and all of its messages from the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <div className="font-medium text-foreground">{threadDeleteTarget?.title}</div>
            {threadCount <= 1 ? (
              <div className="rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-muted-foreground dark:bg-white/[0.04]">
                Projects must keep at least one thread.
              </div>
            ) : null}
            {threadDeleteError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-destructive">
                {threadDeleteError}
              </div>
            ) : null}
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
              Delete thread
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!askDialog?.open} onOpenChange={(open) => !open && setAskDialog(null)}>
        <DialogContent className="border-border bg-background sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Ask another model</DialogTitle>
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
        <DialogContent className="border-border bg-background sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Start a debate thread</DialogTitle>
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
