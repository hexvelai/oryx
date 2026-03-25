import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { AIProvider, AIMode, ChatMessage, ChatSession, DeepDive, DeepDiveThread, SharedUpload, TeamworkMessage, VoteResult } from "@/types/ai";

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
  createDeepDive: (init?: { title?: string; providers?: AIProvider[] }) => string;
  createThread: (deepDiveId: string, init?: { title?: string; type?: DeepDiveThread["type"]; seedMessages?: ChatMessage[] }) => string;
  sendDeepDiveMessage: (deepDiveId: string, threadId: string, content: string) => void;
  addDeepDiveUploads: (deepDiveId: string, files: File[]) => void;
  removeDeepDiveUpload: (deepDiveId: string, uploadId: string) => void;
  forkThreadFromMessages: (init: { deepDiveId?: string; title?: string; type: DeepDiveThread["type"]; seedMessages: ChatMessage[] }) => { deepDiveId: string; threadId: string };
  runVoteInThread: (deepDiveId: string, threadId: string, prompt: string) => void;
  runDebateInThread: (deepDiveId: string, threadId: string, prompt: string, participants: AIProvider[]) => void;
}

const ChatContext = createContext<ChatState | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}

let msgId = 0;
const uid = () => `msg-${++msgId}-${Date.now()}`;

let sessionId = 0;
const sid = () => `session-${++sessionId}-${Date.now()}`;

let deepDiveId = 0;
const did = () => `dive-${++deepDiveId}-${Date.now()}`;

let threadId = 0;
const tid = () => `thread-${++threadId}-${Date.now()}`;

let uploadId = 0;
const upid = () => `upload-${++uploadId}-${Date.now()}`;

const ALL_PROVIDERS: AIProvider[] = ["gpt", "gemini", "claude"];
const PROVIDER_CONFIG_KEY = "mozaic.providerConfig";
const LEGACY_PROVIDER_CONFIG_KEY = "aicorus.providerConfig";
type ProviderConfig = { enabled: Record<AIProvider, boolean>; apiKeys: Partial<Record<AIProvider, string>> };

function loadProviderConfig(): ProviderConfig {
  const fallback: ProviderConfig = {
    enabled: { gpt: true, gemini: true, claude: true },
    apiKeys: {},
  };
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIG_KEY) ?? localStorage.getItem(LEGACY_PROVIDER_CONFIG_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    const enabled = parsed.enabled ?? fallback.enabled;
    const apiKeys = parsed.apiKeys ?? fallback.apiKeys;
    const next = {
      enabled: { gpt: enabled.gpt ?? true, gemini: enabled.gemini ?? true, claude: enabled.claude ?? true },
      apiKeys: { gpt: apiKeys.gpt, gemini: apiKeys.gemini, claude: apiKeys.claude },
    };
    saveProviderConfig(next);
    try {
      localStorage.removeItem(LEGACY_PROVIDER_CONFIG_KEY);
    } catch {
      void 0;
    }
    return next;
  } catch {
    return fallback;
  }
}

function saveProviderConfig(cfg: ProviderConfig) {
  try {
    localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    void 0;
  }
}

type ORRole = "system" | "user" | "assistant";
type ORMessage = { role: ORRole; content: string };
type ORStreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: unknown;
};

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_USER_URL = "https://openrouter.ai/api/v1/models/user";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_MODELS: Record<AIProvider, string> = {
  gpt: "openai/gpt-oss-20b:free",
  gemini: "meta-llama/llama-3.3-70b-instruct:free",
  claude: "nvidia/nemotron-3-super-120b-a12b:free",
};

type ORModelSummary = { id: string; pricing?: { prompt?: string; completion?: string } };

function isFreeModel(m: ORModelSummary) {
  return m.pricing?.prompt === "0" && m.pricing?.completion === "0";
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  if (end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function normalizeOpenRouterError(err: unknown) {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  const parsed = extractFirstJsonObject(raw) as { error?: { message?: unknown } } | null;
  const message = typeof parsed?.error?.message === "string" ? parsed.error.message : raw;

  if (message.includes("openrouter.ai/settings/privacy")) {
    if (message.includes("Fix: Update your OpenRouter Privacy/Guardrails settings")) return message;
    return `${message}\n\nFix: Update your OpenRouter Privacy/Guardrails settings to allow this model/provider for the API key.`;
  }

  return message;
}

async function fetchOpenRouterModelsForKey(apiKey: string, signal?: AbortSignal) {
  const urls = [OPENROUTER_MODELS_USER_URL, OPENROUTER_MODELS_URL];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "mozaic",
        },
        signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: ORModelSummary[] };
      if (Array.isArray(json.data)) return json.data;
    } catch {
      continue;
    }
  }
  return [];
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function buildModelFallbacks(primary: string, pool: ORModelSummary[] | null | undefined, slot: AIProvider) {
  const models = pool ?? [];
  const free = models.filter(isFreeModel).map(m => m.id);
  const prefer =
    slot === "gpt"
      ? free.filter(id => id.includes("gpt") || id.startsWith("openai/"))
      : slot === "gemini"
        ? free.filter(id => id.includes("llama"))
        : free.filter(id => id.includes("nemotron"));

  const fallbacks = uniq([...prefer, ...free]).filter(m => m !== primary).slice(0, 3);
  return fallbacks;
}

function pickBestProvider(args: { prompt: string; history: ChatMessage[]; allowed: AIProvider[] }): { provider: AIProvider; reason: string } {
  const allowed = args.allowed.length ? args.allowed : (["gpt"] as AIProvider[]);
  const p = args.prompt.toLowerCase();
  const h = args.history.slice(-16).map(m => m.content).join("\n").toLowerCase();
  const all = `${h}\n${p}`;

  const hasCodeSignals =
    all.includes("```") ||
    all.includes("traceback") ||
    all.includes("stack trace") ||
    all.includes("exception") ||
    all.includes("error:") ||
    all.includes("typescript") ||
    all.includes("javascript") ||
    all.includes("react") ||
    all.includes("node") ||
    all.includes("python") ||
    all.includes("rust") ||
    all.includes("sql");

  const wantsWriting =
    p.includes("rewrite") ||
    p.includes("rephrase") ||
    p.includes("polish") ||
    p.includes("tone") ||
    p.includes("email") ||
    p.includes("copy") ||
    p.includes("blog") ||
    p.includes("story") ||
    p.includes("brainstorm") ||
    p.includes("ideas") ||
    p.includes("synthesize") ||
    p.includes("summarize") ||
    p.includes("tldr") ||
    p.includes("tl;dr");

  const refersBack =
    (p.includes("above") || p.includes("earlier") || p.includes("previous") || p.includes("as we discussed") || p.includes("that")) &&
    args.history.length >= 4;

  const isLongTurn = args.prompt.length > 500 || args.history.length > 10;

  const wantFastQa =
    args.prompt.length < 180 &&
    (p.startsWith("what") || p.startsWith("why") || p.startsWith("how") || p.startsWith("who") || p.startsWith("when") || p.startsWith("where"));

  const choose = (preferred: AIProvider, reason: string) => ({
    provider: allowed.includes(preferred) ? preferred : (allowed[0] ?? "gpt"),
    reason,
  });

  if (hasCodeSignals) return choose("gpt", "coding/debugging + precise reasoning");
  if (wantsWriting) return choose("claude", "writing/synthesis");
  if (refersBack || isLongTurn) return choose("claude", "long-context continuity");
  if (wantFastQa) return choose("gemini", "fast Q&A");
  return choose("gpt", "general reasoning");
}

function toORChatMessagesWithSystem(args: { provider: AIProvider; history: ChatMessage[] }) {
  const system: ORMessage = {
    role: "system",
    content:
      "Use the full conversation context. Keep continuity across turns. If the user refers to earlier messages, resolve the reference. Be concise unless asked to be detailed.",
  };
  const filtered = args.history
    .filter(m => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
    .map(m => ({ role: m.role as ORRole, content: m.content }));
  return [system, ...filtered];
}

async function openRouterChatOnce(args: { apiKey: string; model: string; messages: ORMessage[]; models?: string[] }) {
  const res = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "mozaic",
    },
    body: JSON.stringify({
      model: args.model,
      models: args.models,
      messages: args.messages,
      stream: false,
      provider: { allow_fallbacks: true, sort: "throughput" },
    }),
  });
  if (!res.ok) {
    throw new Error(normalizeOpenRouterError(await res.text()));
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

async function openRouterChatStream(args: {
  apiKey: string;
  model: string;
  models?: string[];
  messages: ORMessage[];
  onDelta: (delta: string) => void;
  onUsage?: (usage: { reasoningTokens?: number }) => void;
}) {
  const res = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "mozaic",
    },
    body: JSON.stringify({
      model: args.model,
      models: args.models,
      messages: args.messages,
      stream: true,
      provider: { allow_fallbacks: true, sort: "throughput" },
    }),
  });

  if (!res.ok) {
    throw new Error(normalizeOpenRouterError(await res.text()));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const content = await openRouterChatOnce({ apiKey: args.apiKey, model: args.model, models: args.models, messages: args.messages });
    if (content) args.onDelta(content);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as ORStreamChunk;
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) args.onDelta(delta);
        if (parsed.usage) {
          const usageAny = parsed.usage as unknown as { reasoningTokens?: unknown; reasoning_tokens?: unknown };
          const reasoningTokens =
            typeof usageAny.reasoningTokens === "number"
              ? usageAny.reasoningTokens
              : typeof usageAny.reasoning_tokens === "number"
                ? usageAny.reasoning_tokens
                : undefined;
          args.onUsage?.({ reasoningTokens });
        }
      } catch {
        continue;
      }
    }
  }
}

function titleFromPrompt(content: string) {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  const cleaned = firstLine.replace(/\s+/g, " ");
  const max = 48;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned || "New chat";
}

function createSession(init?: Partial<Omit<ChatSession, "id">>): ChatSession {
  const now = Date.now();
  const createdAt = init?.createdAt ?? now;
  return {
    id: sid(),
    title: init?.title ?? "New chat",
    createdAt,
    updatedAt: init?.updatedAt ?? createdAt,
    messages: init?.messages ?? [],
  };
}

function seedSessions(titles: string[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    createSession({ title: titles[0] ?? "New chat", createdAt: now - 2 * 60 * 60 * 1000, updatedAt: now - 20 * 60 * 1000 }),
    createSession({ title: titles[1] ?? "New chat", createdAt: now - day - 3 * 60 * 60 * 1000, updatedAt: now - day - 2 * 60 * 60 * 1000 }),
    createSession({ title: titles[2] ?? "New chat", createdAt: now - 4 * day, updatedAt: now - 4 * day + 60 * 60 * 1000 }),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
}

function createThread(init?: Partial<Omit<DeepDiveThread, "id">>): DeepDiveThread {
  const now = Date.now();
  const createdAt = init?.createdAt ?? now;
  return {
    id: tid(),
    title: init?.title ?? "New thread",
    createdAt,
    updatedAt: init?.updatedAt ?? createdAt,
    type: init?.type ?? "chat",
    messages: init?.messages ?? [],
    voteResults: init?.voteResults,
    teamworkMessages: init?.teamworkMessages,
  };
}

function createDeepDive(init?: Partial<Omit<DeepDive, "id">>): DeepDive {
  const now = Date.now();
  const createdAt = init?.createdAt ?? now;
  return {
    id: did(),
    title: init?.title ?? "New Deep Dive",
    providers: init?.providers ?? ["gpt", "gemini", "claude"],
    createdAt,
    updatedAt: init?.updatedAt ?? createdAt,
    threads: init?.threads ?? [createThread({ title: "Thread 1" })],
    uploads: init?.uploads ?? [],
  };
}

function seedDeepDives(): DeepDive[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const diveA = createDeepDive({
    title: "Pricing page rewrite",
    providers: ["claude", "gpt"],
    updatedAt: now - 35 * 60 * 1000,
    threads: [
      createThread({
        title: "Messaging + positioning",
        createdAt: now - 2 * day,
        updatedAt: now - 35 * 60 * 1000,
        messages: [
          { id: uid(), role: "user", content: "Rewrite the pricing page in a more editorial tone.", timestamp: now - 2 * day, isShared: true },
          { id: uid(), role: "assistant", content: "Here's a structured rewrite that keeps the copy tight and outcome-driven.", timestamp: now - 2 * day + 10 * 60 * 1000, provider: "gpt" },
        ],
      }),
    ],
  });
  const diveB = createDeepDive({
    title: "Onboarding flow",
    providers: ["gemini", "gpt", "claude"],
    updatedAt: now - 5 * 60 * 60 * 1000,
    threads: [
      createThread({
        title: "Step-by-step UX",
        createdAt: now - day,
        updatedAt: now - 5 * 60 * 60 * 1000,
        messages: [
          { id: uid(), role: "user", content: "Propose a 3-step onboarding that feels lightweight.", timestamp: now - day, isShared: true },
          { id: uid(), role: "assistant", content: "A fast, low-friction onboarding works best when each step earns trust.", timestamp: now - day + 12 * 60 * 1000, provider: "claude" },
        ],
      }),
    ],
  });
  const diveC = createDeepDive({
    title: "Router heuristics",
    providers: ["gpt", "gemini"],
    updatedAt: now - 3 * day,
    threads: [
      createThread({
        title: "When to pick which model",
        createdAt: now - 6 * day,
        updatedAt: now - 3 * day,
        messages: [
          { id: uid(), role: "user", content: "Define a router rule-set for choosing an AI per request.", timestamp: now - 6 * day, isShared: true },
          { id: uid(), role: "assistant", content: "Start with a small heuristic set and refine via telemetry.", timestamp: now - 6 * day + 20 * 60 * 1000, provider: "gemini" },
        ],
      }),
    ],
  });
  return [diveA, diveB, diveC].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => loadProviderConfig());
  const availableProviders = ALL_PROVIDERS.filter(p => providerConfig.enabled[p] !== false);
  const enabledList = useCallback((providers: AIProvider[]) => providers.filter(p => providerConfig.enabled[p] !== false), [providerConfig.enabled]);

  const [mode, setMode] = useState<AIMode>("slideshow");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeProviders, setActiveProviders] = useState<AIProvider[]>(availableProviders.length ? availableProviders : ["gpt"]);
  const [sharedContext, setSharedContext] = useState<ChatMessage[]>([]);
  const [teamworkMessages, setTeamworkMessages] = useState<TeamworkMessage[]>([]);
  const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
  const [parallelTargets, setParallelTargets] = useState<AIProvider[]>(availableProviders.length ? availableProviders : ["gpt"]);
  const [parallelMessages, setParallelMessages] = useState<ChatMessage[]>([]);
  const initialDeepDives = useRef<DeepDive[] | null>(null);
  if (!initialDeepDives.current) initialDeepDives.current = seedDeepDives();

  const [deepDives, setDeepDives] = useState<DeepDive[]>(initialDeepDives.current);
  const [activeDeepDiveId, setActiveDeepDiveId] = useState<string | null>(deepDives[0]?.id ?? null);
  const [activeThreadIdByDeepDive, setActiveThreadIdByDeepDive] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    deepDives.forEach(d => {
      init[d.id] = d.threads[0]?.id ?? "";
    });
    return init;
  });
  const initialProviderSessions = useRef<Record<AIProvider, ChatSession[]> | null>(null);
  if (!initialProviderSessions.current) {
    initialProviderSessions.current = {
      gpt: seedSessions(["Architecture draft", "State management options", "Performance checklist"]),
      gemini: seedSessions(["Prototype plan", "Latency notes", "UI polish ideas"]),
      claude: seedSessions(["Requirements pass", "Trade-offs review", "Edge cases"]),
    };
  }

  const initialMasterSessions = useRef<ChatSession[] | null>(null);
  if (!initialMasterSessions.current) {
    initialMasterSessions.current = seedSessions(["Router session", "Routing experiment", "Consensus synthesis"]);
  }

  const initialProvider = initialProviderSessions.current!;
  const initialMaster = initialMasterSessions.current!;

  const [providerSessions, setProviderSessions] = useState<Record<AIProvider, ChatSession[]>>(initialProvider);
  const [activeProviderSessionId, setActiveProviderSessionId] = useState<Record<AIProvider, string>>({
    gpt: initialProvider.gpt[0].id,
    gemini: initialProvider.gemini[0].id,
    claude: initialProvider.claude[0].id,
  });
  const [masterSessions, setMasterSessions] = useState<ChatSession[]>(initialMaster);
  const [activeMasterSessionId, setActiveMasterSessionId] = useState<string>(initialMaster[0].id);
  const [providerIsTyping, setProviderIsTyping] = useState<Record<AIProvider, boolean>>({
    gpt: false,
    gemini: false,
    claude: false,
  });

  const getApiKeyForProvider = useCallback((provider: AIProvider) => {
    const direct = providerConfig.apiKeys[provider]?.trim();
    if (direct) return direct;
    for (const p of ALL_PROVIDERS) {
      const k = providerConfig.apiKeys[p]?.trim();
      if (k) return k;
    }
    return undefined;
  }, [providerConfig.apiKeys]);

  const [openRouterModelPool, setOpenRouterModelPool] = useState<ORModelSummary[] | null>(null);

  useEffect(() => {
    const key = Object.values(providerConfig.apiKeys).find(Boolean)?.trim() ?? "";
    if (!key) {
      setOpenRouterModelPool(null);
      return;
    }
    const ctrl = new AbortController();
    void fetchOpenRouterModelsForKey(key, ctrl.signal).then(setOpenRouterModelPool).catch(() => void 0);
    return () => ctrl.abort();
  }, [providerConfig.apiKeys]);

  const toORChatMessages = useCallback((messages: ChatMessage[]): ORMessage[] => {
    const filtered = messages.filter(m => m.role === "user" || m.role === "assistant");
    return filtered.map(m => ({ role: m.role as ORRole, content: m.content }));
  }, []);

  const toggleProvider = useCallback((p: AIProvider) => {
    if (providerConfig.enabled[p] === false) return;
    setActiveProviders(prev => {
      if (prev.includes(p)) {
        const next = prev.filter(x => x !== p);
        return next.length ? next : prev;
      }
      return [...prev, p];
    });
  }, [providerConfig.enabled]);

  useEffect(() => {
    setActiveProviders(prev => {
      if (availableProviders.length === 0) return prev;
      const next = prev.filter(p => providerConfig.enabled[p] !== false);
      const expanded = Array.from(new Set([...next, ...availableProviders]));
      return expanded.length ? expanded : [availableProviders[0]];
    });
    setParallelTargets(prev => {
      const next = prev.filter(p => providerConfig.enabled[p] !== false);
      if (next.length) return next;
      return availableProviders.length ? [...availableProviders] : prev;
    });
  }, [availableProviders, providerConfig.enabled]);

  const setProviderApiKey = useCallback((provider: AIProvider, apiKey: string) => {
    setProviderConfig(prev => {
      const next: ProviderConfig = { ...prev, apiKeys: { ...prev.apiKeys, [provider]: apiKey } };
      saveProviderConfig(next);
      return next;
    });
  }, []);

  const setProviderEnabled = useCallback((provider: AIProvider, enabled: boolean) => {
    setProviderConfig(prev => {
      const next: ProviderConfig = { ...prev, enabled: { ...prev.enabled, [provider]: enabled } };
      saveProviderConfig(next);
      return next;
    });
  }, []);

  const setActiveProviderSession = useCallback((provider: AIProvider, sessionId: string) => {
    setActiveProviderSessionId(prev => ({ ...prev, [provider]: sessionId }));
  }, []);

  const setActiveMasterSession = useCallback((sessionId: string) => {
    setActiveMasterSessionId(sessionId);
  }, []);

  const createProviderSession = useCallback((provider: AIProvider) => {
    const session = createSession();
    setProviderSessions(prev => ({ ...prev, [provider]: [session, ...prev[provider]] }));
    setActiveProviderSessionId(prev => ({ ...prev, [provider]: session.id }));
  }, []);

  const createMasterSession = useCallback(() => {
    const session = createSession();
    setMasterSessions(prev => [session, ...prev]);
    setActiveMasterSessionId(session.id);
  }, []);

  const setActiveDeepDive = useCallback((deepDiveId: string) => {
    setActiveDeepDiveId(deepDiveId);
  }, []);

  const setActiveThread = useCallback((deepDiveId: string, threadId: string) => {
    setActiveThreadIdByDeepDive(prev => ({ ...prev, [deepDiveId]: threadId }));
  }, []);

  const createDeepDiveFn = useCallback((init?: { title?: string; providers?: AIProvider[] }) => {
    const now = Date.now();
    const providers = enabledList(init?.providers ?? (availableProviders.length ? availableProviders : ["gpt"]));
    const d = createDeepDive({
      title: init?.title ?? "New Deep Dive",
      providers,
      updatedAt: now,
      threads: [createThread({ title: "Thread 1", updatedAt: now })],
      uploads: [],
    });
    setDeepDives(prev => [d, ...prev]);
    setActiveDeepDiveId(d.id);
    setActiveThreadIdByDeepDive(prev => ({ ...prev, [d.id]: d.threads[0].id }));
    return d.id;
  }, [availableProviders, enabledList]);

  const createThreadFn = useCallback((deepDiveId: string, init?: { title?: string; type?: DeepDiveThread["type"]; seedMessages?: ChatMessage[] }) => {
    const now = Date.now();
    const t = createThread({
      title: init?.title ?? "New thread",
      type: init?.type ?? "chat",
      updatedAt: now,
      messages: init?.seedMessages ?? [],
    });
    setDeepDives(prev =>
      prev.map(d => {
        if (d.id !== deepDiveId) return d;
        return { ...d, updatedAt: now, threads: [t, ...d.threads] };
      }),
    );
    setActiveThreadIdByDeepDive(prev => ({ ...prev, [deepDiveId]: t.id }));
    return t.id;
  }, []);

  const addDeepDiveUploads = useCallback((deepDiveId: string, files: File[]) => {
    const now = Date.now();
    const uploads: SharedUpload[] = files.map(f => ({
      id: upid(),
      name: f.name,
      type: f.type || "application/octet-stream",
      url: URL.createObjectURL(f),
      createdAt: now,
    }));
    setDeepDives(prev =>
      prev.map(d => {
        if (d.id !== deepDiveId) return d;
        return { ...d, updatedAt: now, uploads: [...uploads, ...d.uploads] };
      }),
    );
  }, []);

  const removeDeepDiveUpload = useCallback((deepDiveId: string, uploadId: string) => {
    setDeepDives(prev =>
      prev.map(d => {
        if (d.id !== deepDiveId) return d;
        const removing = d.uploads.find(u => u.id === uploadId);
        if (removing) URL.revokeObjectURL(removing.url);
        return { ...d, uploads: d.uploads.filter(u => u.id !== uploadId) };
      }),
    );
  }, []);

  const runVoteInThread = useCallback((deepDiveId: string, threadId: string, prompt: string) => {
    const now = Date.now();
    setDeepDives(prev =>
      prev.map(d => {
        if (d.id !== deepDiveId) return d;
        return {
          ...d,
          updatedAt: now,
          threads: d.threads.map(t => {
            if (t.id !== threadId) return t;
            return {
              ...t,
              updatedAt: now,
              type: "vote",
              voteResults: [],
            };
          }),
        };
      }),
    );
    void (async () => {
      const d = deepDives.find(x => x.id === deepDiveId);
      const baseParticipants = d?.providers.length ? d.providers : (availableProviders.length ? availableProviders : (["gpt"] as AIProvider[]));
      const participants = enabledList(baseParticipants);
      const apiKey = participants.map(p => getApiKeyForProvider(p)).find(Boolean);

      if (!apiKey) {
        const voteResults: VoteResult[] = participants.map(p => ({
          provider: p,
          response: "Missing OpenRouter API key. Add one in Add AIs.",
          reasoning: "No API key configured.",
          votes: [],
        }));
        setDeepDives(prev =>
          prev.map(d2 => {
            if (d2.id !== deepDiveId) return d2;
            return { ...d2, threads: d2.threads.map(t => (t.id === threadId ? { ...t, voteResults } : t)) };
          }),
        );
        return;
      }

      try {
        const proposals = await Promise.all(
          participants.map(async (p) => {
            const content = await openRouterChatOnce({
              apiKey,
              model: OPENROUTER_MODELS[p],
              models: buildModelFallbacks(OPENROUTER_MODELS[p], openRouterModelPool, p),
              messages: [
                { role: "system", content: 'Return JSON: {"response": string, "reasoning": string}. Be concise.' },
                { role: "user", content: prompt },
              ],
            });
            const parsed = extractFirstJsonObject(content) as { response?: string; reasoning?: string } | null;
            return {
              provider: p,
              response: parsed?.response?.trim() || content.trim(),
              reasoning: parsed?.reasoning?.trim() || "",
            };
          }),
        );

        const proposalText = proposals.map(p => `- ${p.provider}: ${p.response}`).join("\n");
        const votesByChoice: Record<AIProvider, AIProvider[]> = { gpt: [], gemini: [], claude: [] };

        await Promise.all(
          participants.map(async (voter) => {
            const voteRaw = await openRouterChatOnce({
              apiKey,
              model: OPENROUTER_MODELS[voter],
              models: buildModelFallbacks(OPENROUTER_MODELS[voter], openRouterModelPool, voter),
              messages: [
                { role: "system", content: 'Vote for the best proposal. Return JSON: {"voteFor":"gpt"|"gemini"|"claude","reason":string}.' },
                { role: "user", content: `Prompt: ${prompt}\n\nProposals:\n${proposalText}` },
              ],
            });
            const parsed = extractFirstJsonObject(voteRaw) as { voteFor?: AIProvider; reason?: string } | null;
            const voteFor = parsed?.voteFor && participants.includes(parsed.voteFor) ? parsed.voteFor : null;
            if (voteFor) votesByChoice[voteFor].push(voter);
          }),
        );

        const voteResults: VoteResult[] = proposals.map(p => ({
          provider: p.provider,
          response: p.response,
          reasoning: p.reasoning,
          votes: votesByChoice[p.provider] ?? [],
        }));

        setDeepDives(prev =>
          prev.map(d2 => {
            if (d2.id !== deepDiveId) return d2;
            return {
              ...d2,
              threads: d2.threads.map(t => (t.id === threadId ? { ...t, voteResults } : t)),
            };
          }),
        );
      } catch (e) {
        const err = normalizeOpenRouterError(e) || "OpenRouter error";
        const voteResults: VoteResult[] = participants.map(p => ({
          provider: p,
          response: `Error: ${err}`,
          reasoning: "",
          votes: [],
        }));
        setDeepDives(prev =>
          prev.map(d2 => {
            if (d2.id !== deepDiveId) return d2;
            return { ...d2, threads: d2.threads.map(t => (t.id === threadId ? { ...t, voteResults } : t)) };
          }),
        );
      }
    })();
  }, [availableProviders, deepDives, enabledList, getApiKeyForProvider, openRouterModelPool]);

  const runDebateInThread = useCallback((deepDiveId: string, threadId: string, prompt: string, participants: AIProvider[]) => {
    const now = Date.now();
    setDeepDives(prev =>
      prev.map(d => {
        if (d.id !== deepDiveId) return d;
        return {
          ...d,
          updatedAt: now,
          threads: d.threads.map(t => {
            if (t.id !== threadId) return t;
            return {
              ...t,
              updatedAt: now,
              type: "teamwork",
              teamworkMessages: [],
            };
          }),
        };
      }),
    );
    const enabledParticipants = enabledList(participants);
    const apiKey = enabledParticipants.map(p => getApiKeyForProvider(p)).find(Boolean);

    if (!apiKey || enabledParticipants.length === 0) {
      const msg: TeamworkMessage = {
        id: uid(),
        from: "gpt",
        to: "all",
        content: "Missing OpenRouter API key. Add one in Add AIs.",
        timestamp: Date.now(),
      };
      setDeepDives(prev =>
        prev.map(d => {
          if (d.id !== deepDiveId) return d;
          return {
            ...d,
            threads: d.threads.map(t => (t.id === threadId ? { ...t, teamworkMessages: [msg] } : t)),
          };
        }),
      );
      return;
    }

    void (async () => {
      const transcript: Array<{ from: AIProvider; content: string }> = [];
      for (const p of enabledParticipants) {
        const twId = uid();
        const empty: TeamworkMessage = { id: twId, from: p, to: "all", content: "", timestamp: Date.now() };
        setDeepDives(prev =>
          prev.map(d => {
            if (d.id !== deepDiveId) return d;
            return {
              ...d,
              threads: d.threads.map(t => (t.id === threadId ? { ...t, teamworkMessages: [...(t.teamworkMessages ?? []), empty] } : t)),
            };
          }),
        );

        let acc = "";
        try {
          await openRouterChatStream({
            apiKey,
            model: OPENROUTER_MODELS[p],
            models: buildModelFallbacks(OPENROUTER_MODELS[p], openRouterModelPool, p),
            messages: [
              { role: "system", content: `You are ${p}. Respond to the prompt and the current transcript. Be concise.` },
              { role: "user", content: `Prompt:\n${prompt}\n\nTranscript:\n${transcript.map(t => `${t.from}: ${t.content}`).join("\n")}` },
            ],
            onDelta: (delta) => {
              acc += delta;
              const next = acc;
              setDeepDives(prev =>
                prev.map(d => {
                  if (d.id !== deepDiveId) return d;
                  return {
                    ...d,
                    threads: d.threads.map(t => {
                      if (t.id !== threadId) return t;
                      return {
                        ...t,
                        teamworkMessages: (t.teamworkMessages ?? []).map(m => (m.id === twId ? { ...m, content: next } : m)),
                      };
                    }),
                  };
                }),
              );
            },
          });
        } catch (e) {
          const err = normalizeOpenRouterError(e) || "OpenRouter error";
          setDeepDives(prev =>
            prev.map(d => {
              if (d.id !== deepDiveId) return d;
              return {
                ...d,
                threads: d.threads.map(t => {
                  if (t.id !== threadId) return t;
                  return {
                    ...t,
                    teamworkMessages: (t.teamworkMessages ?? []).map(m => (m.id === twId ? { ...m, content: `Error: ${err}` } : m)),
                  };
                }),
              };
            }),
          );
        }

        transcript.push({ from: p, content: acc.trim() });
      }
    })();
  }, [enabledList, getApiKeyForProvider, openRouterModelPool]);

  const forkThreadFromMessages = useCallback((init: { deepDiveId?: string; title?: string; type: DeepDiveThread["type"]; seedMessages: ChatMessage[] }) => {
    const deepDiveId = init.deepDiveId ?? createDeepDiveFn({ providers: availableProviders.length ? availableProviders : ["gpt"], title: "New Deep Dive" });
    const threadId = createThreadFn(deepDiveId, { title: init.title ?? "New thread", type: init.type, seedMessages: init.seedMessages });
    return { deepDiveId, threadId };
  }, [availableProviders, createDeepDiveFn, createThreadFn]);

  const sendDeepDiveMessage = useCallback((deepDiveId: string, threadId: string, content: string) => {
    const now = Date.now();
    const mentionMatch = content.match(/@([a-z0-9-]+)/i);
    const rawLabel = mentionMatch?.[1]?.toLowerCase();
    const labelToProvider: Record<string, AIProvider> = {
      gpt: "gpt",
      gemini: "gemini",
      claude: "claude",
      llama: "gemini",
      nemotron: "claude",
    };
    const explicit = (rawLabel ? labelToProvider[rawLabel] : undefined);
    const cleaned = mentionMatch ? content.replace(mentionMatch[0], "").trim() : content.trim();
    if (!cleaned) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: cleaned,
      timestamp: now,
      isShared: true,
    };

    setDeepDives(prev =>
      prev.map(d => {
        if (d.id !== deepDiveId) return d;
        return {
          ...d,
          updatedAt: now,
          threads: d.threads.map(t => {
            if (t.id !== threadId) return t;
            const shouldSetTitle = t.messages.length === 0 && t.title === "New thread";
            return { ...t, title: shouldSetTitle ? titleFromPrompt(cleaned) : t.title, updatedAt: now, messages: [...t.messages, userMsg] };
          }),
        };
      }),
    );
    void (async () => {
      const d = deepDives.find(x => x.id === deepDiveId);
      const baseParticipants = d?.providers.length ? d.providers : (availableProviders.length ? availableProviders : (["gpt"] as AIProvider[]));
      const participants = enabledList(baseParticipants);
      const explicitAllowed = explicit && participants.includes(explicit) ? explicit : undefined;
      const thread = d?.threads.find(t => t.id === threadId);
      const history = [...(thread?.messages ?? []), userMsg]
        .filter(m => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
        .slice(-30);

      const picked = pickBestProvider({ prompt: cleaned, history, allowed: participants });
      const chosen = explicitAllowed ?? picked.provider;
      const apiKey = getApiKeyForProvider(chosen);

      const providerLabel = chosen === "gpt" ? "GPT" : chosen === "gemini" ? "Llama" : "Nemotron";
      const reason = explicitAllowed ? "" : picked.reason;

      const assistantId = uid();
      const response: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: apiKey ? "" : "Missing OpenRouter API key. Add one in Add AIs.",
        timestamp: Date.now(),
        provider: chosen,
        autoRouted: !explicitAllowed,
        routingNote: explicitAllowed ? undefined : `Answered by ${providerLabel} — ${reason}.`,
      };

      setDeepDives(prev =>
        prev.map(d2 => {
          if (d2.id !== deepDiveId) return d2;
          return {
            ...d2,
            updatedAt: Date.now(),
            threads: d2.threads.map(t => (t.id === threadId ? { ...t, updatedAt: Date.now(), messages: [...t.messages, response] } : t)),
          };
        }),
      );

      if (!apiKey) return;

      let acc = "";
      try {
        await openRouterChatStream({
          apiKey,
          model: OPENROUTER_MODELS[chosen],
          models: buildModelFallbacks(OPENROUTER_MODELS[chosen], openRouterModelPool, chosen),
          messages: toORChatMessagesWithSystem({ provider: chosen, history }),
          onDelta: (delta) => {
            acc += delta;
            const next = acc;
            setDeepDives(prev =>
              prev.map(d2 => {
                if (d2.id !== deepDiveId) return d2;
                return {
                  ...d2,
                  threads: d2.threads.map(t => {
                    if (t.id !== threadId) return t;
                    return { ...t, messages: t.messages.map(m => (m.id === assistantId ? { ...m, content: next } : m)) };
                  }),
                };
              }),
            );
          },
          onUsage: (usage) => {
            if (typeof usage.reasoningTokens === "number") {
              setDeepDives(prev =>
                prev.map(d2 => {
                  if (d2.id !== deepDiveId) return d2;
                  return {
                    ...d2,
                    threads: d2.threads.map(t => {
                      if (t.id !== threadId) return t;
                      return { ...t, messages: t.messages.map(m => (m.id === assistantId ? { ...m, reasoningTokens: usage.reasoningTokens } : m)) };
                    }),
                  };
                }),
              );
            }
          },
        });
      } catch (e) {
        const err = normalizeOpenRouterError(e) || "OpenRouter error";
        setDeepDives(prev =>
          prev.map(d2 => {
            if (d2.id !== deepDiveId) return d2;
            return {
              ...d2,
              threads: d2.threads.map(t => {
                if (t.id !== threadId) return t;
                return { ...t, messages: t.messages.map(m => (m.id === assistantId ? { ...m, content: `Error: ${err}` } : m)) };
              }),
            };
          }),
        );
      }
    })();
  }, [availableProviders, deepDives, enabledList, getApiKeyForProvider, openRouterModelPool]);

  const appendToProviderSessionId = useCallback((provider: AIProvider, sessionId: string, msg: ChatMessage) => {
    const now = Date.now();
    setProviderSessions(prev => ({
      ...prev,
      [provider]: prev[provider].map(s => {
        if (s.id !== sessionId) return s;
        const shouldSetTitle = s.messages.length === 0 && msg.role === "user" && s.title === "New chat";
        return {
          ...s,
          title: shouldSetTitle ? titleFromPrompt(msg.content) : s.title,
          updatedAt: now,
          messages: [...s.messages, msg],
        };
      }),
    }));
  }, []);

  const appendToMasterSessionId = useCallback((sessionId: string, msg: ChatMessage) => {
    const now = Date.now();
    setMasterSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId) return s;
        const shouldSetTitle = s.messages.length === 0 && msg.role === "user" && s.title === "New chat";
        return {
          ...s,
          title: shouldSetTitle ? titleFromPrompt(msg.content) : s.title,
          updatedAt: now,
          messages: [...s.messages, msg],
        };
      }),
    );
  }, []);

  const updateProviderSessionMessage = useCallback((provider: AIProvider, sessionId: string, messageId: string, content: string) => {
    const now = Date.now();
    setProviderSessions(prev => ({
      ...prev,
      [provider]: prev[provider].map(s => {
        if (s.id !== sessionId) return s;
        return { ...s, updatedAt: now, messages: s.messages.map(m => (m.id === messageId ? { ...m, content } : m)) };
      }),
    }));
  }, []);

  const updateProviderSessionReasoningTokens = useCallback((provider: AIProvider, sessionId: string, messageId: string, reasoningTokens: number) => {
    const now = Date.now();
    setProviderSessions(prev => ({
      ...prev,
      [provider]: prev[provider].map(s => {
        if (s.id !== sessionId) return s;
        return { ...s, updatedAt: now, messages: s.messages.map(m => (m.id === messageId ? { ...m, reasoningTokens } : m)) };
      }),
    }));
  }, []);

  const updateMasterSessionMessage = useCallback((sessionId: string, messageId: string, content: string) => {
    const now = Date.now();
    setMasterSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId) return s;
        return { ...s, updatedAt: now, messages: s.messages.map(m => (m.id === messageId ? { ...m, content } : m)) };
      }),
    );
  }, []);

  const updateMasterSessionReasoningTokens = useCallback((sessionId: string, messageId: string, reasoningTokens: number) => {
    const now = Date.now();
    setMasterSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId) return s;
        return { ...s, updatedAt: now, messages: s.messages.map(m => (m.id === messageId ? { ...m, reasoningTokens } : m)) };
      }),
    );
  }, []);

  const updateSharedMessage = useCallback((messageId: string, content: string) => {
    setSharedContext(prev => prev.map(m => (m.id === messageId ? { ...m, content } : m)));
  }, []);

  const updateSharedReasoningTokens = useCallback((messageId: string, reasoningTokens: number) => {
    setSharedContext(prev => prev.map(m => (m.id === messageId ? { ...m, reasoningTokens } : m)));
  }, []);

  const updateParallelMessage = useCallback((messageId: string, content: string) => {
    setParallelMessages(prev => prev.map(m => (m.id === messageId ? { ...m, content } : m)));
  }, []);

  const updateParallelReasoningTokens = useCallback((messageId: string, reasoningTokens: number) => {
    setParallelMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reasoningTokens } : m)));
  }, []);

  const streamAssistantMessage = useCallback(async (args: {
    provider: AIProvider;
    apiKey: string;
    history: ChatMessage[];
    onContent: (content: string) => void;
    onReasoningTokens?: (reasoningTokens: number) => void;
  }) => {
    let acc = "";
    let lastReasoningTokens: number | undefined;
    await openRouterChatStream({
      apiKey: args.apiKey,
      model: OPENROUTER_MODELS[args.provider],
      models: buildModelFallbacks(OPENROUTER_MODELS[args.provider], openRouterModelPool, args.provider),
      messages: toORChatMessagesWithSystem({ provider: args.provider, history: args.history }),
      onDelta: (delta) => {
        acc += delta;
        args.onContent(acc);
      },
      onUsage: (usage) => {
        if (typeof usage.reasoningTokens === "number") {
          lastReasoningTokens = usage.reasoningTokens;
          args.onReasoningTokens?.(usage.reasoningTokens);
        }
      },
    });
    return lastReasoningTokens;
  }, [openRouterModelPool]);

  const sendParallelMessage = useCallback((content: string, providers?: AIProvider[]) => {
    const targets = (providers ?? parallelTargets).filter(p => providerConfig.enabled[p] !== false);
    const trimmed = content.trim();
    if (!trimmed || targets.length === 0) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      isShared: true,
    };

    setSharedContext(prev => [...prev, userMsg]);
    setParallelMessages(prev => [...prev, userMsg]);

    targets.forEach(p => {
      const sessionId = activeProviderSessionId[p];
      appendToProviderSessionId(p, sessionId, userMsg);

      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        provider: p,
      };

      appendToProviderSessionId(p, sessionId, assistantMsg);
      setSharedContext(prev => [...prev, assistantMsg]);
      setParallelMessages(prev => [...prev, assistantMsg]);

      const apiKey = getApiKeyForProvider(p);
      if (!apiKey) {
        const err = "Missing OpenRouter API key. Add one in Add AIs.";
        updateProviderSessionMessage(p, sessionId, assistantId, err);
        updateSharedMessage(assistantId, err);
        updateParallelMessage(assistantId, err);
        return;
      }

      setProviderIsTyping(prev => ({ ...prev, [p]: true }));
      const session = providerSessions[p].find(s => s.id === sessionId);
      const history = [...(session?.messages ?? []), userMsg].slice(-20);

      void streamAssistantMessage({
        provider: p,
        apiKey,
        history,
        onContent: (next) => {
          updateProviderSessionMessage(p, sessionId, assistantId, next);
          updateSharedMessage(assistantId, next);
          updateParallelMessage(assistantId, next);
        },
        onReasoningTokens: (reasoningTokens) => {
          updateProviderSessionReasoningTokens(p, sessionId, assistantId, reasoningTokens);
          updateSharedReasoningTokens(assistantId, reasoningTokens);
          updateParallelReasoningTokens(assistantId, reasoningTokens);
        },
      })
        .catch((e) => {
          const err = `Error: ${normalizeOpenRouterError(e)}`;
          updateProviderSessionMessage(p, sessionId, assistantId, err);
          updateSharedMessage(assistantId, err);
          updateParallelMessage(assistantId, err);
        })
        .finally(() => setProviderIsTyping(prev => ({ ...prev, [p]: false })));
    });
  }, [
    activeProviderSessionId,
    appendToProviderSessionId,
    getApiKeyForProvider,
    parallelTargets,
    providerConfig.enabled,
    providerSessions,
    streamAssistantMessage,
    updateParallelMessage,
    updateParallelReasoningTokens,
    updateProviderSessionMessage,
    updateProviderSessionReasoningTokens,
    updateSharedMessage,
    updateSharedReasoningTokens,
  ]);

  const getProviderMessages = useCallback((provider: AIProvider) => {
    const activeId = activeProviderSessionId[provider];
    const session = providerSessions[provider].find(s => s.id === activeId);
    return session?.messages ?? [];
  }, [activeProviderSessionId, providerSessions]);

  const masterMessages = masterSessions.find(s => s.id === activeMasterSessionId)?.messages ?? [];

  const sendMessage = useCallback((content: string, target: AIProvider | "master") => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      isShared: true,
    };

    setSharedContext(prev => [...prev, userMsg]);

    if (target === "master") {
      const masterSessionId = activeMasterSessionId;
      appendToMasterSessionId(masterSessionId, userMsg);

      const routes: AIProvider[] = availableProviders.length ? availableProviders : ["gpt"];
      const masterSession = masterSessions.find(s => s.id === masterSessionId);
      const masterHistory = [...(masterSession?.messages ?? []), userMsg]
        .filter(m => (m.role === "user" || m.role === "assistant") && m.provider !== "master" && m.content.trim().length > 0)
        .slice(-30);
      const picked = pickBestProvider({ prompt: trimmed, history: masterHistory, allowed: routes });
      const chosen = picked.provider;

      const providerSessionId = activeProviderSessionId[chosen];

      const routedLabel = chosen === "gpt" ? "GPT" : chosen === "gemini" ? "Llama" : "Nemotron";
      const routedReason = picked.reason;
      const routeMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `Routing to **${routedLabel}** — best suited for ${routedReason}.`,
        timestamp: Date.now(),
        provider: "master",
      };

      appendToMasterSessionId(masterSessionId, routeMsg);
      appendToProviderSessionId(chosen, providerSessionId, userMsg);

      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        provider: chosen,
      };

      appendToProviderSessionId(chosen, providerSessionId, assistantMsg);
      appendToMasterSessionId(masterSessionId, assistantMsg);
      setSharedContext(prev => [...prev, assistantMsg]);

      const apiKey = getApiKeyForProvider(chosen);
      if (!apiKey) {
        const err = "Missing OpenRouter API key. Add one in Add AIs.";
        updateProviderSessionMessage(chosen, providerSessionId, assistantId, err);
        updateMasterSessionMessage(masterSessionId, assistantId, err);
        updateSharedMessage(assistantId, err);
        return;
      }

      setProviderIsTyping(prev => ({ ...prev, [chosen]: true }));

      void streamAssistantMessage({
        provider: chosen,
        apiKey,
        history: masterHistory,
        onContent: (next) => {
          updateProviderSessionMessage(chosen, providerSessionId, assistantId, next);
          updateMasterSessionMessage(masterSessionId, assistantId, next);
          updateSharedMessage(assistantId, next);
        },
        onReasoningTokens: (reasoningTokens) => {
          updateProviderSessionReasoningTokens(chosen, providerSessionId, assistantId, reasoningTokens);
          updateMasterSessionReasoningTokens(masterSessionId, assistantId, reasoningTokens);
          updateSharedReasoningTokens(assistantId, reasoningTokens);
        },
      })
        .catch((e) => {
          const err = `Error: ${normalizeOpenRouterError(e)}`;
          updateProviderSessionMessage(chosen, providerSessionId, assistantId, err);
          updateMasterSessionMessage(masterSessionId, assistantId, err);
          updateSharedMessage(assistantId, err);
        })
        .finally(() => setProviderIsTyping(prev => ({ ...prev, [chosen]: false })));
    } else {
      const providerSessionId = activeProviderSessionId[target];
      appendToProviderSessionId(target, providerSessionId, userMsg);

      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        provider: target,
      };

      appendToProviderSessionId(target, providerSessionId, assistantMsg);
      setSharedContext(prev => [...prev, assistantMsg]);

      const apiKey = getApiKeyForProvider(target);
      if (!apiKey) {
        const err = "Missing OpenRouter API key. Add one in Add AIs.";
        updateProviderSessionMessage(target, providerSessionId, assistantId, err);
        updateSharedMessage(assistantId, err);
        return;
      }

      setProviderIsTyping(prev => ({ ...prev, [target]: true }));
      const session = providerSessions[target].find(s => s.id === providerSessionId);
      const history = [...(session?.messages ?? []), userMsg].slice(-20);

      void streamAssistantMessage({
        provider: target,
        apiKey,
        history,
        onContent: (next) => {
          updateProviderSessionMessage(target, providerSessionId, assistantId, next);
          updateSharedMessage(assistantId, next);
        },
        onReasoningTokens: (reasoningTokens) => {
          updateProviderSessionReasoningTokens(target, providerSessionId, assistantId, reasoningTokens);
          updateSharedReasoningTokens(assistantId, reasoningTokens);
        },
      })
        .catch((e) => {
          const err = `Error: ${normalizeOpenRouterError(e)}`;
          updateProviderSessionMessage(target, providerSessionId, assistantId, err);
          updateSharedMessage(assistantId, err);
        })
        .finally(() => setProviderIsTyping(prev => ({ ...prev, [target]: false })));
    }
  }, [
    activeMasterSessionId,
    activeProviderSessionId,
    appendToMasterSessionId,
    appendToProviderSessionId,
    availableProviders,
    getApiKeyForProvider,
    masterSessions,
    providerSessions,
    streamAssistantMessage,
    updateMasterSessionMessage,
    updateMasterSessionReasoningTokens,
    updateProviderSessionMessage,
    updateProviderSessionReasoningTokens,
    updateSharedMessage,
    updateSharedReasoningTokens,
  ]);

  const startTeamwork = useCallback((prompt: string) => {
    setMode("teamwork");
    setTeamworkMessages([]);

    const trimmed = prompt.trim();
    if (!trimmed) return;

    const masterSessionId = activeMasterSessionId;
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      isShared: true,
    };
    setSharedContext(prev => [...prev, userMsg]);
    appendToMasterSessionId(masterSessionId, userMsg);

    const participants = enabledList(availableProviders.length ? availableProviders : ["gpt"]);
    const apiKey = participants.map(p => getApiKeyForProvider(p)).find(Boolean);
    if (!apiKey || participants.length === 0) {
      setTeamworkMessages([{ id: uid(), from: "gpt", to: "all", content: "Missing OpenRouter API key. Add one in Add AIs.", timestamp: Date.now() }]);
      return;
    }

    void (async () => {
      const transcript: Array<{ from: AIProvider; content: string }> = [];
      for (const p of participants) {
        const twId = uid();
        setTeamworkMessages(prev => [...prev, { id: twId, from: p, to: "all", content: "", timestamp: Date.now() }]);
        let acc = "";
        try {
          await openRouterChatStream({
            apiKey,
            model: OPENROUTER_MODELS[p],
            models: buildModelFallbacks(OPENROUTER_MODELS[p], openRouterModelPool, p),
            messages: [
              { role: "system", content: `You are ${p}. Collaborate with the other AIs. Be concise and practical.` },
              { role: "user", content: `Prompt:\n${trimmed}\n\nTranscript:\n${transcript.map(t => `${t.from}: ${t.content}`).join("\n")}` },
            ],
            onDelta: (delta) => {
              acc += delta;
              const next = acc;
              setTeamworkMessages(prev => prev.map(m => (m.id === twId ? { ...m, content: next } : m)));
            },
          });
        } catch (e) {
          const err = normalizeOpenRouterError(e) || "OpenRouter error";
          setTeamworkMessages(prev => prev.map(m => (m.id === twId ? { ...m, content: `Error: ${err}` } : m)));
        }
        transcript.push({ from: p, content: acc.trim() });
      }

      let synthesis = "";
      try {
        synthesis = await openRouterChatOnce({
          apiKey,
          model: OPENROUTER_MODELS.gpt,
          models: buildModelFallbacks(OPENROUTER_MODELS.gpt, openRouterModelPool, "gpt"),
          messages: [
            { role: "system", content: "Synthesize a final consensus. Return a short, actionable answer." },
            { role: "user", content: `Prompt:\n${trimmed}\n\nTeam transcript:\n${transcript.map(t => `${t.from}: ${t.content}`).join("\n")}` },
          ],
        });
      } catch (e) {
        synthesis = `Error: ${normalizeOpenRouterError(e)}`;
      }

      appendToMasterSessionId(masterSessionId, {
        id: uid(),
        role: "assistant",
        content: synthesis.trim() || "No synthesis generated.",
        timestamp: Date.now(),
        provider: "master",
      });
    })();
  }, [activeMasterSessionId, appendToMasterSessionId, availableProviders, enabledList, getApiKeyForProvider, openRouterModelPool]);

  const startVoting = useCallback((prompt: string) => {
    setMode("voting");
    setVoteResults([]);

    const trimmed = prompt.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      isShared: true,
    };
    setSharedContext(prev => [...prev, userMsg]);
    appendToMasterSessionId(activeMasterSessionId, userMsg);

    const participants = enabledList(availableProviders.length ? availableProviders : ["gpt"]);
    const apiKey = participants.map(p => getApiKeyForProvider(p)).find(Boolean);
    if (!apiKey || participants.length === 0) {
      setVoteResults(participants.map(p => ({ provider: p, response: "Missing OpenRouter API key. Add one in Add AIs.", reasoning: "No API key configured.", votes: [] })));
      return;
    }

    void (async () => {
      try {
        const proposals = await Promise.all(
          participants.map(async (p) => {
            const content = await openRouterChatOnce({
              apiKey,
              model: OPENROUTER_MODELS[p],
              models: buildModelFallbacks(OPENROUTER_MODELS[p], openRouterModelPool, p),
              messages: [
                { role: "system", content: 'Return JSON: {"response": string, "reasoning": string}. Be concise.' },
                { role: "user", content: trimmed },
              ],
            });
            const parsed = extractFirstJsonObject(content) as { response?: string; reasoning?: string } | null;
            return { provider: p, response: parsed?.response?.trim() || content.trim(), reasoning: parsed?.reasoning?.trim() || "" };
          }),
        );

        const proposalText = proposals.map(p => `- ${p.provider}: ${p.response}`).join("\n");
        const votesByChoice: Record<AIProvider, AIProvider[]> = { gpt: [], gemini: [], claude: [] };

        await Promise.all(
          participants.map(async (voter) => {
            const voteRaw = await openRouterChatOnce({
              apiKey,
              model: OPENROUTER_MODELS[voter],
              models: buildModelFallbacks(OPENROUTER_MODELS[voter], openRouterModelPool, voter),
              messages: [
                { role: "system", content: 'Vote for the best proposal. Return JSON: {"voteFor":"gpt"|"gemini"|"claude","reason":string}.' },
                { role: "user", content: `Prompt: ${trimmed}\n\nProposals:\n${proposalText}` },
              ],
            });
            const parsed = extractFirstJsonObject(voteRaw) as { voteFor?: AIProvider } | null;
            const voteFor = parsed?.voteFor && participants.includes(parsed.voteFor) ? parsed.voteFor : null;
            if (voteFor) votesByChoice[voteFor].push(voter);
          }),
        );

        setVoteResults(
          proposals.map(p => ({
            provider: p.provider,
            response: p.response,
            reasoning: p.reasoning,
            votes: votesByChoice[p.provider] ?? [],
          })),
        );
      } catch (e) {
        const err = normalizeOpenRouterError(e) || "OpenRouter error";
        setVoteResults(participants.map(p => ({ provider: p, response: `Error: ${err}`, reasoning: "", votes: [] })));
      }
    })();
  }, [activeMasterSessionId, appendToMasterSessionId, availableProviders, enabledList, getApiKeyForProvider, openRouterModelPool]);

  return (
    <ChatContext.Provider
      value={{
        mode, setMode, masterMessages, sharedContext,
        teamworkMessages, voteResults, activeProviders,
        availableProviders,
        providerApiKeys: providerConfig.apiKeys,
        setProviderApiKey,
        setProviderEnabled,
        currentSlide, setCurrentSlide, toggleProvider,
        sendMessage, startTeamwork, startVoting,
        parallelTargets,
        setParallelTargets,
        parallelMessages,
        sendParallelMessage,
        providerSessions,
        activeProviderSessionId,
        setActiveProviderSession,
        createProviderSession,
        masterSessions,
        activeMasterSessionId,
        setActiveMasterSession,
        createMasterSession,
        getProviderMessages,
        providerIsTyping,
        deepDives,
        activeDeepDiveId,
        setActiveDeepDive,
        activeThreadIdByDeepDive,
        setActiveThread,
        createDeepDive: createDeepDiveFn,
        createThread: createThreadFn,
        sendDeepDiveMessage,
        addDeepDiveUploads,
        removeDeepDiveUpload,
        forkThreadFromMessages,
        runVoteInThread,
        runDebateInThread,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
