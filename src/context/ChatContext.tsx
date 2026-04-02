import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery, useAction as useConvexAction } from "convex/react";
import { convexApi } from "@/lib/convex-api";
import type { AIProvider, AIMode, ChatMessage, ChatSession, DeepDive, DeepDiveThread, SharedUpload, TeamworkMessage, VoteResult } from "@/types/ai";
import { AI_MODELS } from "@/types/ai";

interface ChatState {
  mode: AIMode;
  setMode: (mode: AIMode) => void;
  masterMessages: ChatMessage[];
  sharedContext: ChatMessage[];
  teamworkMessages: TeamworkMessage[];
  voteResults: VoteResult[];
  activeProviders: AIProvider[];
  availableProviders: AIProvider[];
  providerApiKeys: Partial<Record<AIProvider, string>>;
  setProviderApiKey: (provider: AIProvider, apiKey: string) => void;
  setProviderEnabled: (provider: AIProvider, enabled: boolean) => void;
  currentSlide: number;
  setCurrentSlide: (i: number) => void;
  toggleProvider: (p: AIProvider) => void;
  sendMessage: (content: string, target: AIProvider | "master") => void;
  parallelTargets: AIProvider[];
  setParallelTargets: (providers: AIProvider[]) => void;
  parallelMessages: ChatMessage[];
  sendParallelMessage: (content: string, providers?: AIProvider[]) => void;
  startTeamwork: (prompt: string) => void;
  startVoting: (prompt: string) => void;
  providerSessions: Record<AIProvider, ChatSession[]>;
  activeProviderSessionId: Record<AIProvider, string>;
  setActiveProviderSession: (provider: AIProvider, sessionId: string) => void;
  createProviderSession: (provider: AIProvider) => void;
  masterSessions: ChatSession[];
  activeMasterSessionId: string;
  setActiveMasterSession: (sessionId: string) => void;
  createMasterSession: () => void;
  getProviderMessages: (provider: AIProvider) => ChatMessage[];
  providerIsTyping: Record<AIProvider, boolean>;
  deepDives: DeepDive[];
  activeDeepDiveId: string | null;
  setActiveDeepDive: (deepDiveId: string) => void;
  activeThreadIdByDeepDive: Record<string, string>;
  setActiveThread: (deepDiveId: string, threadId: string) => void;
  createDeepDive: (init?: { title?: string; providers?: AIProvider[] }) => Promise<string>;
  createThread: (deepDiveId: string, init?: { title?: string; type?: DeepDiveThread["type"]; seedMessages?: ChatMessage[] }) => Promise<string>;
  sendDeepDiveMessage: (deepDiveId: string, threadId: string, content: string) => Promise<void>;
  addDeepDiveUploads: (deepDiveId: string, files: File[]) => void;
  removeDeepDiveUpload: (deepDiveId: string, uploadId: string) => Promise<void>;
  forkThreadFromMessages: (init: { deepDiveId?: string; title?: string; type: DeepDiveThread["type"]; seedMessages: ChatMessage[] }) => Promise<{ deepDiveId: string; threadId: string }>;
  runVoteInThread: (deepDiveId: string, threadId: string, prompt: string) => Promise<void>;
  runDebateInThread: (deepDiveId: string, threadId: string, prompt: string, participants: AIProvider[]) => Promise<void>;
}

const ChatContext = createContext<ChatState | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}

const ALL_PROVIDERS = Object.keys(AI_MODELS) as AIProvider[];
const PROVIDER_CONFIG_KEY = "oryx.providerConfig";

type ProviderConfig = {
  enabled: Partial<Record<AIProvider, boolean>>;
  apiKeys: Partial<Record<AIProvider, string>>;
};

function loadProviderConfig(): ProviderConfig {
  const enabledDefault = Object.fromEntries(ALL_PROVIDERS.map((provider) => [provider, true])) as ProviderConfig["enabled"];
  const fallback: ProviderConfig = {
    enabled: enabledDefault,
    apiKeys: {},
  };
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIG_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    const record = parsed as Record<string, unknown>;
    const enabled = (record.enabled && typeof record.enabled === "object" ? (record.enabled as ProviderConfig["enabled"]) : fallback.enabled) ?? fallback.enabled;
    const apiKeys = (record.apiKeys && typeof record.apiKeys === "object" ? (record.apiKeys as ProviderConfig["apiKeys"]) : fallback.apiKeys) ?? fallback.apiKeys;
    return { enabled, apiKeys };
  } catch {
    return fallback;
  }
}

function saveProviderConfig(cfg: ProviderConfig) {
  localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(cfg));
}

type ConvexDeepDiveRecord = {
  id: string;
  title: string;
  providers: AIProvider[];
  createdAt: number;
  updatedAt: number;
  threads: Array<{
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    type: DeepDiveThread["type"];
    messages: unknown[];
    voteResults?: VoteResult[];
    teamworkMessages?: TeamworkMessage[];
  }>;
  uploads: SharedUpload[];
  myRole?: unknown;
};

type ConvexMessagePart = { type?: unknown; text?: unknown };
type ConvexThreadMessage = {
  id?: unknown;
  role?: unknown;
  parts?: unknown;
  metadata?: { createdAt?: unknown; provider?: unknown } | undefined;
};

function toText(parts: unknown) {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      const p = part as ConvexMessagePart;
      if (p?.type === "text" && typeof p.text === "string") return p.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // Convex Hooks
  const convexDeepDives = (useConvexQuery(convexApi.deepDives.list, {}) as unknown as ConvexDeepDiveRecord[] | undefined) ?? [];
  const convexCreateDeepDive = useConvexMutation(convexApi.deepDives.createDeepDive);
  const convexCreateThread = useConvexMutation(convexApi.deepDives.createThread);
  const convexAppendUserMessage = useConvexMutation(convexApi.deepDives.appendUserMessage);
  const convexSendThreadMessage = useConvexAction(convexApi.ai.sendThreadMessage);
  const convexRunVote = useConvexAction(convexApi.ai.runVote);
  const convexRunDebate = useConvexAction(convexApi.ai.runDebate);
  const convexRemoveUpload = useConvexMutation(convexApi.deepDives.removeUpload);

  const [providerConfig, setProviderConfig] = useState(loadProviderConfig);
  const [mode, setMode] = useState<AIMode>("slideshow");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeDeepDiveId, setActiveDeepDiveId] = useState<string | null>(null);
  const [activeThreadIdByDeepDive, setActiveThreadIdByDeepDive] = useState<Record<string, string>>({});

  const availableProviders = ALL_PROVIDERS.filter(p => providerConfig.enabled[p] !== false);
  const fallbackProvider = availableProviders[0] ?? ALL_PROVIDERS[0] ?? "nemotron";
  const [activeProviders, setActiveProviders] = useState<AIProvider[]>(availableProviders.length ? availableProviders : [fallbackProvider]);
  const [parallelTargets, setParallelTargets] = useState<AIProvider[]>(availableProviders.length ? availableProviders : [fallbackProvider]);

  // Sync active deep dive and threads when list changes (avoid setState every run — new object refs caused max update depth)
  useEffect(() => {
    setActiveDeepDiveId((current) => {
      if (convexDeepDives.length > 0 && !current) return convexDeepDives[0].id;
      return current;
    });
    setActiveThreadIdByDeepDive((prev) => {
      let next: Record<string, string> | null = null;
      for (const d of convexDeepDives) {
        const tid = d.threads[0]?.id ?? "";
        if (tid && !prev[d.id]) {
          if (!next) next = { ...prev };
          next[d.id] = tid;
        }
      }
      return next ?? prev;
    });
  }, [convexDeepDives]);

  const createDeepDive = useCallback(async (init?: { title?: string; providers?: AIProvider[] }) => {
    const id = await convexCreateDeepDive({
      title: init?.title ?? "New Project",
      providers: init?.providers ?? availableProviders,
    });
    const idStr = String(id);
    setActiveDeepDiveId(idStr);
    return idStr;
  }, [convexCreateDeepDive, availableProviders]);

  const createThread = useCallback(async (deepDiveId: string, init?: { title?: string; type?: DeepDiveThread["type"]; seedMessages?: ChatMessage[] }) => {
    const id = await convexCreateThread({
      deepDiveId,
      title: init?.title,
      type: init?.type,
      seedMessages: init?.seedMessages,
    });
    const idStr = String(id);
    setActiveThreadIdByDeepDive(prev => ({ ...prev, [deepDiveId]: idStr }));
    return idStr;
  }, [convexCreateThread]);

  const sendDeepDiveMessage = useCallback(async (deepDiveId: string, threadId: string, content: string) => {
    await convexAppendUserMessage({ threadId, text: content });
    await convexSendThreadMessage({ threadId });
  }, [convexAppendUserMessage, convexSendThreadMessage]);

  const removeDeepDiveUpload = useCallback(async (deepDiveId: string, uploadId: string) => {
    await convexRemoveUpload({ deepDiveId, uploadId });
  }, [convexRemoveUpload]);

  const runVoteInThread = useCallback(async (deepDiveId: string, threadId: string, prompt: string) => {
    await convexRunVote({ threadId, prompt });
  }, [convexRunVote]);

  const runDebateInThread = useCallback(async (deepDiveId: string, threadId: string, prompt: string, participants: AIProvider[]) => {
    await convexRunDebate({ threadId, prompt, participants });
  }, [convexRunDebate]);

  const forkThreadFromMessages = useCallback(async (init: { deepDiveId?: string; title?: string; type: DeepDiveThread["type"]; seedMessages: ChatMessage[] }) => {
    const dId = init.deepDiveId ?? await createDeepDive({ title: "New Project" });
    const tId = await createThread(dId, { title: init.title, type: init.type, seedMessages: init.seedMessages });
    return { deepDiveId: dId, threadId: tId };
  }, [createDeepDive, createThread]);

  // Map Convex Data to UI Types
  const deepDives: DeepDive[] = useMemo(() => {
    return convexDeepDives.map(d => ({
      id: d.id,
      title: d.title,
      providers: d.providers,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      threads: d.threads.map(t => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        type: t.type,
        messages: t.messages.map((message) => {
          const m = message as ConvexThreadMessage;
          const id = typeof m.id === "string" ? m.id : `msg-${Math.random().toString(16).slice(2)}`;
          const role = (m.role === "assistant" || m.role === "user" ? m.role : "assistant") as ChatMessage["role"];
          const content = toText(m.parts);
          const timestamp = typeof m.metadata?.createdAt === "number" ? m.metadata.createdAt : Date.now();
          const provider =
            typeof m.metadata?.provider === "string" && ALL_PROVIDERS.includes(m.metadata.provider as AIProvider)
              ? (m.metadata.provider as AIProvider)
              : undefined;
          return {
            id,
            role,
            content,
            timestamp,
            provider,
          isShared: true,
          } satisfies ChatMessage;
        }),
        voteResults: t.voteResults,
        teamworkMessages: t.teamworkMessages,
      })),
      uploads: d.uploads,
    }));
  }, [convexDeepDives]);

  const value = useMemo<ChatState>(() => ({
    mode,
    setMode,
    masterMessages: [], // Simplified for now
    sharedContext: [],
    teamworkMessages: [],
    voteResults: [],
    activeProviders,
    availableProviders,
    providerApiKeys: providerConfig.apiKeys,
    setProviderApiKey: (p, k) => {
      const next = { ...providerConfig, apiKeys: { ...providerConfig.apiKeys, [p]: k } };
      setProviderConfig(next);
      saveProviderConfig(next);
    },
    setProviderEnabled: (p, e) => {
      const next = { ...providerConfig, enabled: { ...providerConfig.enabled, [p]: e } };
      setProviderConfig(next);
      saveProviderConfig(next);
    },
    currentSlide,
    setCurrentSlide,
    toggleProvider: (p) => setActiveProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]),
    sendMessage: () => {},
    parallelTargets,
    setParallelTargets,
    parallelMessages: [],
    sendParallelMessage: () => {},
    startTeamwork: () => {},
    startVoting: () => {},
    providerSessions: Object.fromEntries(ALL_PROVIDERS.map((provider) => [provider, [] as ChatSession[]])) as Record<
      AIProvider,
      ChatSession[]
    >,
    activeProviderSessionId: Object.fromEntries(ALL_PROVIDERS.map((provider) => [provider, ""])) as Record<AIProvider, string>,
    setActiveProviderSession: () => {},
    createProviderSession: () => {},
    masterSessions: [],
    activeMasterSessionId: "",
    setActiveMasterSession: () => {},
    createMasterSession: () => {},
    getProviderMessages: () => [],
    providerIsTyping: Object.fromEntries(ALL_PROVIDERS.map((provider) => [provider, false])) as Record<AIProvider, boolean>,
    deepDives,
    activeDeepDiveId,
    setActiveDeepDive: setActiveDeepDiveId,
    activeThreadIdByDeepDive,
    setActiveThread: (d, t) => setActiveThreadIdByDeepDive(prev => ({ ...prev, [d]: t })),
    createDeepDive,
    createThread,
    sendDeepDiveMessage,
    addDeepDiveUploads: () => {},
    removeDeepDiveUpload,
    forkThreadFromMessages,
    runVoteInThread,
    runDebateInThread,
  }), [
    mode, activeProviders, availableProviders, providerConfig, currentSlide, parallelTargets,
    deepDives, activeDeepDiveId, activeThreadIdByDeepDive, createDeepDive, createThread,
    sendDeepDiveMessage, removeDeepDiveUpload, forkThreadFromMessages, runVoteInThread, runDebateInThread
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
