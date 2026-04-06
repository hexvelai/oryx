"use node";

import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { OpenRouter } from "@openrouter/sdk";
import type { AIProvider } from "../src/types/ai";
import type { DeepDiveUIMessage } from "../src/lib/deep-dive-types";

const MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  nemotron: "nvidia/nemotron-3-super-120b-a12b:free",
  "free-autorouter": "openrouter/free",
  dolphin: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "qwen-coder": "qwen/qwen3-coder:free",
  "glm-air": "z-ai/glm-4.5-air:free",
  "trinity-mini": "arcee-ai/trinity-mini:free",
  "qwen-plus": "qwen/qwen3.6-plus-preview:free",
  "step-flash": "stepfun/step-3.5-flash:free",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-2-flash": "gemini-2.0-flash",
  "deepseek-chat": "deepseek-chat",
  "deepseek-reasoner": "deepseek-reasoner",
};
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

const labelToProvider: Record<string, AIProvider> = {
  nemotron: "nemotron",
  claude: "nemotron",
  autorouter: "free-autorouter",
  "free-autorouter": "free-autorouter",
  deepseek: "deepseek-chat",
  "deepseek-chat": "deepseek-chat",
  "deepseek-reasoner": "deepseek-reasoner",
  dolphin: "dolphin",
  "qwen-coder": "qwen-coder",
  coder: "qwen-coder",
  qwen: "qwen-plus",
  "qwen-plus": "qwen-plus",
  plus: "qwen-plus",
  glm: "glm-air",
  "glm-air": "glm-air",
  air: "glm-air",
  trinity: "trinity-mini",
  "trinity-mini": "trinity-mini",
  gemini: "gemini-3-flash",
  "gemini-3": "gemini-3-flash",
  "gemini-2": "gemini-2-flash",
};

const DEFAULT_PROVIDERS: AIProvider[] = [
  "nemotron",
  "free-autorouter",
  "dolphin",
  "qwen-coder",
  "glm-air",
  "trinity-mini",
  "qwen-plus",
  "deepseek-chat",
  "deepseek-reasoner",
];
const MODEL_COOLDOWN_MS = 2 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

function normalizeProviderId(provider: string): AIProvider | null {
  const raw = provider.trim();
  const lower = raw.toLowerCase();
  if (lower === "claude") return "nemotron";
  if (lower === "autorouter" || lower === "free autorouter" || lower === "openrouter/free") return "free-autorouter";
  if (lower === "deepseek") return "deepseek-chat";
  if (lower === "gemini-3-flash") return "gemini-3-flash";
  if (lower === "gemini-2-flash") return "gemini-2-flash";
  if (DEFAULT_PROVIDERS.includes(raw as AIProvider)) return raw as AIProvider;
  return null;
}

function parseExplicitProvider(input: string) {
  const match = input.match(/@([a-z0-9-]+)/i);
  const raw = match?.[1]?.toLowerCase();
  return raw ? labelToProvider[raw] : undefined;
}

function stripProviderMention(input: string) {
  return input.replace(/@([a-z0-9-]+)/i, "").trim();
}

function providerDisplayName(provider: AIProvider) {
  if (provider === "nemotron") return "Nemotron";
  if (provider === "free-autorouter") return "free autorouter";
  if (provider === "dolphin") return "Dolphin";
  if (provider === "qwen-coder") return "Qwen Coder";
  if (provider === "glm-air") return "GLM Air";
  if (provider === "trinity-mini") return "Trinity Mini";
  if (provider === "gemini-3-flash") return "Gemini Flash";
  if (provider === "gemini-2-flash") return "Gemini 2 Flash";
  if (provider === "deepseek-chat") return "DeepSeek Chat";
  if (provider === "deepseek-reasoner") return "DeepSeek Reasoner";
  return "Qwen Plus";
}

function firstTextPart(message: DeepDiveUIMessage | undefined) {
  if (!message) return "";
  for (const part of message.parts as Array<{ type?: string; text?: string }>) {
    if (part.type === "text" && typeof part.text === "string") {
      return part.text;
    }
  }
  return "";
}

function getLatestUserText(messages: DeepDiveUIMessage[]) {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  return firstTextPart(latestUser);
}

function extractPartText(part: unknown, allowedTypes: Array<"text" | "reasoning">): string | null {
  if (!part || typeof part !== "object") return null;
  const record = part as Record<string, unknown>;
  const type = record.type;
  const text = record.text;
  if (typeof type !== "string" || typeof text !== "string") return null;
  if (!allowedTypes.includes(type as "text" | "reasoning")) return null;
  return text;
}

function joinAllowedPartText(message: DeepDiveUIMessage, allowedTypes: Array<"text" | "reasoning">) {
  return (message.parts as unknown[])
    .map((part) => extractPartText(part, allowedTypes))
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join("\n")
    .trim();
}

function userPromptMessage(id: string, text: string): DeepDiveUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  } as DeepDiveUIMessage;
}

function formattingSystemMessage(): DeepDiveUIMessage {
  return {
    id: "formatting-system",
    role: "system",
    parts: [
      {
        type: "text",
        text:
          "Format responses in GitHub-flavored Markdown. For math, use LaTeX wrapped in $...$ (inline) or $$...$$ (block) so it renders correctly.",
      },
    ],
  } as DeepDiveUIMessage;
}

function pickBestProvider(args: { prompt: string; history: DeepDiveUIMessage[]; allowed: AIProvider[] }) {
  const allowed = args.allowed.length ? args.allowed : (["nemotron"] as AIProvider[]);
  const prompt = args.prompt.toLowerCase();
  const historyText = args.history
    .slice(-16)
    .map((message) => joinAllowedPartText(message, ["text"]))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const all = `${historyText}\n${prompt}`;
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
    prompt.includes("rewrite") ||
    prompt.includes("rephrase") ||
    prompt.includes("polish") ||
    prompt.includes("tone") ||
    prompt.includes("email") ||
    prompt.includes("copy") ||
    prompt.includes("blog") ||
    prompt.includes("story") ||
    prompt.includes("brainstorm") ||
    prompt.includes("ideas") ||
    prompt.includes("synthesize") ||
    prompt.includes("summarize");

  const refersBack =
    (prompt.includes("above") || prompt.includes("earlier") || prompt.includes("previous") || prompt.includes("as we discussed") || prompt.includes("that")) &&
    args.history.length >= 4;

  const isLongTurn = args.prompt.length > 500 || args.history.length > 10;
  const wantsFastQa =
    args.prompt.length < 180 &&
    (prompt.startsWith("what") || prompt.startsWith("why") || prompt.startsWith("how") || prompt.startsWith("who") || prompt.startsWith("when") || prompt.startsWith("where"));

  const choose = (provider: AIProvider, reason: string) => ({
    provider: allowed.includes(provider) ? provider : (allowed[0] ?? "nemotron"),
    reason,
  });

  if (hasCodeSignals) return choose("qwen-coder", "coding and debugging");
  if (wantsWriting) return choose("dolphin", "writing and synthesis");
  if (refersBack || isLongTurn) return choose("nemotron", "longer context continuity");
  if (wantsFastQa) return choose("glm-air", "fast question answering");
  return choose("qwen-plus", "general reasoning");
}

function isPrivacyBlockedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message || "";
  return (
    message.includes("No endpoints available matching your guardrail restrictions and data policy") ||
    message.includes("guardrail restrictions") ||
    message.includes("data policy")
  );
}

function isRetryableModelError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = (error.message || "").toLowerCase();
  if (
    message.includes("missing openrouter api key") ||
    message.includes("missing gemini api key") ||
    message.includes("invalid api key") ||
    message.includes("not authenticated") ||
    message.includes("unauthorized")
  ) {
    return false;
  }
  return (
    message.includes("provider returned error") ||
    message.includes("guardrail restrictions") ||
    message.includes("data policy") ||
    message.includes("no endpoints found") ||
    message.includes("no endpoints available") ||
    message.includes("no models provided") ||
    message.includes("no model provided") ||
    message.includes("model is required") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable")
  );
}

function sortProvidersBySpeed(providers: AIProvider[]) {
  const order: AIProvider[] = [
    "gemini-3-flash",
    "gemini-2-flash",
    "deepseek-chat",
    "free-autorouter",
    "glm-air",
    "qwen-plus",
    "qwen-coder",
    "dolphin",
    "trinity-mini",
    "nemotron",
    "deepseek-reasoner",
  ];
  return providers.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function candidateModelsFromProviders(providers: AIProvider[]) {
  const seen = new Set<string>();
  const out: Array<{ provider: AIProvider; model: string }> = [];
  for (const provider of providers) {
    const model = (MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL).trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push({ provider, model });
  }
  return out;
}

async function runChatCompletionWithFallback(args: {
  openRouterApiKey?: string;
  geminiApiKey?: string;
  deepSeekApiKey?: string;
  messages: DeepDiveUIMessage[];
  preferredProvider: AIProvider;
  allowedProviders: AIProvider[];
  temperature?: number;
}) {
  const orderedProviders = [
    args.preferredProvider,
    ...sortProvidersBySpeed(args.allowedProviders.filter((provider) => provider !== args.preferredProvider)),
  ];
  const candidates = candidateModelsFromProviders(orderedProviders);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const text = await runChatCompletion({
        provider: candidate.provider,
        model: candidate.model,
        messages: args.messages,
        temperature: args.temperature,
        openRouterApiKey: args.openRouterApiKey,
        geminiApiKey: args.geminiApiKey,
        deepSeekApiKey: args.deepSeekApiKey,
      });
      return { text, provider: candidate.provider, model: candidate.model };
    } catch (error) {
      lastError = error;
      if (!isRetryableModelError(error)) throw error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Unable to generate a response with available models.");
}

type CouncilPosition = "AGREE" | "DISAGREE" | "PARTIALLY_AGREE" | "ABSTAIN";
type CouncilDepth = "quick" | "balanced" | "thorough";
type CouncilMemberResponse = {
  provider: AIProvider;
  model: string;
  position: CouncilPosition;
  confidencePct: number;
  raw: string;
};

function councilDepthConfig(mode: CouncilDepth) {
  if (mode === "quick") {
    return {
      members: 1,
      debateRounds: 0,
      includeFreshEyes: false,
      perCallTimeoutMs: 8000,
    };
  }
  if (mode === "balanced") {
    return {
      members: 2,
      debateRounds: 0,
      includeFreshEyes: false,
      perCallTimeoutMs: 10000,
    };
  }
  return {
    members: 3,
    debateRounds: 1,
    includeFreshEyes: false,
    perCallTimeoutMs: 12000,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function providersWithConfiguredKeys(args: {
  providers: AIProvider[];
  openRouterApiKey: string;
  geminiApiKey: string;
  deepSeekApiKey: string;
}) {
  return args.providers.filter((provider) => {
    if (provider.startsWith("gemini-")) return Boolean(args.geminiApiKey);
    if (provider.startsWith("deepseek-")) return Boolean(args.deepSeekApiKey);
    return Boolean(args.openRouterApiKey);
  });
}

function councilMemberPrompt(args: { prompt: string; phase: "round1" | "round2"; transcript?: string }) {
  const base =
    `You are a member of an AI council.\n\n` +
    `Return exactly this structure:\n` +
    `POSITION: [AGREE / DISAGREE / PARTIALLY AGREE / ABSTAIN]\n` +
    `CONFIDENCE: [HIGH / MEDIUM / LOW] (X%)\n` +
    `PROPOSAL: one clear recommendation/answer\n` +
    `REASONING: 2-3 sentences\n` +
    `EVIDENCE: [URL if you have one, else "Based on training data"]\n` +
    `WHAT WOULD CHANGE MY MIND: specific evidence needed\n\n` +
    `Prompt:\n${args.prompt}\n`;

  if (args.phase === "round1") return base;
  return (
    base +
    `\nTranscript so far (other members' views):\n${args.transcript || "(none)"}\n\n` +
    `If you change POSITION, you must explain what evidence changed your mind.\n`
  );
}

function parseCouncilResponse(text: string): { position: CouncilPosition; confidencePct: number; proposal: string } {
  const upper = text.toUpperCase();
  const position: CouncilPosition =
    upper.includes("POSITION: DISAGREE") ? "DISAGREE" :
    upper.includes("POSITION: PARTIALLY AGREE") ? "PARTIALLY_AGREE" :
    upper.includes("POSITION: AGREE") ? "AGREE" :
    upper.includes("POSITION: ABSTAIN") ? "ABSTAIN" :
    "ABSTAIN";

  const pctMatch = text.match(/CONFIDENCE:\s*(?:HIGH|MEDIUM|LOW)?\s*\(?\s*(\d{1,3})\s*%?\s*\)?/i);
  const pctRaw = pctMatch ? Number(pctMatch[1]) : NaN;
  const confidencePct = Number.isFinite(pctRaw)
    ? Math.max(0, Math.min(100, pctRaw))
    : position === "ABSTAIN"
      ? 40
      : 65;

  const proposalMatch = text.match(/PROPOSAL:\s*([\s\S]*?)(?:\n[A-Z_ ]+:|$)/i);
  const proposal = (proposalMatch?.[1] ?? "").trim();
  return { position, confidencePct, proposal };
}

function pmSynthesisPrompt(args: { prompt: string; memberResponses: CouncilMemberResponse[]; roundLabel: string }) {
  const roster = args.memberResponses
    .map((r) => `### ${r.provider} (${r.confidencePct}%)\n${r.raw}`)
    .join("\n\n---\n\n");
  return (
    `You are the council PM. Synthesize the council into a single helpful output.\n\n` +
    `Prompt:\n${args.prompt}\n\n` +
    `Council responses (${args.roundLabel}):\n${roster}\n\n` +
    `Output Markdown with:\n` +
    `## Consensus\n- Recommendation\n- Key reasons\n` +
    `## Disagreements\n- Bullet list of main conflicts\n` +
    `## Next question (optional)\n- One clarifying question if needed\n`
  );
}

function freshEyesPrompt(args: { prompt: string; finalAnswer: string }) {
  return (
    `You are a "fresh eyes" validator. You get the original prompt and the final answer only.\n` +
    `Provide constructive improvements and missing caveats.\n\n` +
    `Prompt:\n${args.prompt}\n\n` +
    `Final answer:\n${args.finalAnswer}\n\n` +
    `Output:\n- Improvements (bullets)\n- Missing caveats (bullets)\n- Confidence (0-100%)\n`
  );
}

async function runCouncilMember(args: {
  openRouterApiKey?: string;
  geminiApiKey?: string;
  deepSeekApiKey?: string;
  prompt: string;
  phase: "round1" | "round2";
  candidate: { provider: AIProvider; model: string };
  allowedProviders: AIProvider[];
  transcript?: string;
  temperature: number;
}) {
  const result = await runChatCompletionWithFallback({
    openRouterApiKey: args.openRouterApiKey,
    geminiApiKey: args.geminiApiKey,
    deepSeekApiKey: args.deepSeekApiKey,
    preferredProvider: args.candidate.provider,
    allowedProviders: args.allowedProviders,
    temperature: args.temperature,
    messages: [
      userPromptMessage(
        `council-${args.phase}-${args.candidate.provider}`,
        councilMemberPrompt({ prompt: args.prompt, phase: args.phase, transcript: args.transcript }),
      ),
    ],
  });
  const parsed = parseCouncilResponse(result.text);
  return {
    provider: result.provider,
    model: result.model,
    raw: result.text,
    position: parsed.position,
    confidencePct: parsed.confidencePct,
    proposal: parsed.proposal,
  };
}

async function resolveOpenRouterKey(ctx: ActionCtx) {
  const stored = await ctx.runQuery(internal.settings.getOpenRouterKey, {});
  const envKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  const apiKey = stored || envKey;
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key. Add it in AI Settings.");
  }
  return apiKey;
}

async function resolveGeminiKey(ctx: ActionCtx) {
  const stored = await ctx.runQuery(internal.settings.getGeminiKey, {});
  const envKey = process.env.GEMINI_API_KEY?.trim() || "";
  const apiKey = stored || envKey;
  if (!apiKey) {
    throw new Error("Missing Gemini API key. Add it in AI Settings.");
  }
  return apiKey;
}

async function resolveDeepSeekKey(ctx: ActionCtx) {
  const stored = await ctx.runQuery(internal.settings.getDeepSeekKey, {});
  const envKey = process.env.DEEPSEEK_API_KEY?.trim() || "";
  const apiKey = stored || envKey;
  if (!apiKey) {
    throw new Error("Missing DeepSeek API key. Add it in AI Settings.");
  }
  return apiKey;
}

function toOpenRouterMessages(messages: DeepDiveUIMessage[]) {
  const byId = new Map<string, string>();
  for (const message of messages) {
    const text = joinAllowedPartText(message, ["text"]);
    if (message.id && text) byId.set(message.id, text);
  }

  return messages.flatMap((message) => {
    if (message.role === "system") {
      const text = joinAllowedPartText(message, ["text"]);
      return text ? [{ role: "system", content: text }] : [];
    }

    if (message.role === "user") {
      const text = joinAllowedPartText(message, ["text"]);
      const metadata = message.metadata as unknown as {
        author?: { name?: string; email?: string };
        replyTo?: { messageId?: string; excerpt?: string };
      } | null;

      const authorName = metadata?.author?.name || metadata?.author?.email || "Human";
      const replyId = metadata?.replyTo?.messageId;
      const replyExcerpt = metadata?.replyTo?.excerpt || (replyId ? byId.get(replyId) : undefined);

      const composed = replyId
        ? `From ${authorName} (replying to):\n${replyExcerpt ? `---\n${replyExcerpt}\n---\n\n` : ""}${text}`
        : `From ${authorName}:\n${text}`;

      return text ? [{ role: "user", content: composed }] : [];
    }

    const text = joinAllowedPartText(message, ["text", "reasoning"]);
    return text ? [{ role: "assistant", content: text }] : [];
  });
}

function toGeminiPrompt(messages: DeepDiveUIMessage[]) {
  const lines: string[] = [];
  for (const message of messages) {
    const text = joinAllowedPartText(message, ["text", "reasoning"]);
    if (!text) continue;
    if (message.role === "system") lines.push(`System:\n${text}`);
    else if (message.role === "user") lines.push(`User:\n${text}`);
    else lines.push(`Assistant:\n${text}`);
  }
  return lines.join("\n\n---\n\n").trim();
}

async function runGeminiGenerateContent(args: {
  apiKey: string;
  model: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
}) {
  const model = args.model?.trim() || MODEL_BY_PROVIDER["gemini-3-flash"];
  if (!model) throw new Error("Gemini model is required");

  const prompt = toGeminiPrompt(args.messages);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": args.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: args.temperature ?? 0.7,
        },
      }),
      signal: controller.signal,
    },
  ).finally(() => clearTimeout(timer));

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || "Gemini request failed";
    throw new Error(`${message}\n\nModel: ${model}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response");
  return text.trim();
}

async function runDeepSeekChatCompletion(args: {
  apiKey: string;
  model: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
}) {
  const model = args.model?.trim();
  if (!model) throw new Error("DeepSeek model is required");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: toOpenRouterMessages(args.messages),
      temperature: args.temperature ?? 0.7,
      stream: false,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        message?: string;
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "DeepSeek request failed";
    throw new Error(`${message}\n\nModel: ${model}`);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("DeepSeek returned an empty response");
  return text.trim();
}

async function runOpenRouterChatCompletion(args: {
  apiKey: string;
  model: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
}) {
  const requestedModel = args.model?.trim() || MODEL_BY_PROVIDER.nemotron || DEFAULT_MODEL;
  const runRequest = async (model: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    return await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://oryx.local",
        "X-Title": "oryx",
      },
      body: JSON.stringify({
        model,
        messages: toOpenRouterMessages(args.messages),
        temperature: args.temperature ?? 0.7,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  };
  let model = requestedModel;
  let response = await runRequest(model);
  let payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        message?: string;
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;

  if (!response.ok) {
    let message = payload?.error?.message || payload?.message || "OpenRouter request failed";
    const noModelProvided =
      message.includes("No models provided") ||
      message.includes("No model provided") ||
      message.toLowerCase().includes("model is required");

    if (noModelProvided) {
      const openrouter = createOpenRouter({ apiKey: args.apiKey });
      const sdk = await generateText({
        model: openrouter(model || DEFAULT_MODEL),
        messages: toOpenRouterMessages(args.messages) as unknown as never,
        temperature: args.temperature ?? 0.7,
      });
      const sdkText = sdk.text ?? "";
      if (sdkText.trim()) return sdkText.trim();
      throw new Error(`No models provided\n\nModel: ${model}`);
    }

    if (noModelProvided && model !== DEFAULT_MODEL) {
      model = DEFAULT_MODEL;
      response = await runRequest(model);
      payload = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string };
            message?: string;
            choices?: Array<{ message?: { content?: string } }>;
          }
        | null;
      if (response.ok) {
        const retryText = payload?.choices?.[0]?.message?.content;
        if (typeof retryText === "string" && retryText.trim()) {
          return retryText.trim();
        }
        throw new Error("OpenRouter returned an empty response");
      }
      message = payload?.error?.message || payload?.message || "OpenRouter request failed";
    }

    const privacyBlocked =
      message.includes("No endpoints available matching your guardrail restrictions and data policy") ||
      message.includes("guardrail restrictions") ||
      message.includes("data policy");
    if (privacyBlocked) {
      throw new Error(
        `${message}\n\nModel: ${model}\n\nFix: Update your OpenRouter privacy/data policy settings to allow compatible endpoints: https://openrouter.ai/settings/privacy`,
      );
    }
    throw new Error(`${message}\n\nModel: ${model}`);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text.trim();
}

async function runChatCompletion(args: {
  provider: AIProvider;
  model: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
  openRouterApiKey?: string;
  geminiApiKey?: string;
  deepSeekApiKey?: string;
}) {
  const provider = args.provider;
  if (provider.startsWith("gemini-")) {
    const apiKey = args.geminiApiKey?.trim() || "";
    if (!apiKey) throw new Error("Missing Gemini API key. Add it in AI Settings.");
    return runGeminiGenerateContent({
      apiKey,
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
    });
  }

  if (provider.startsWith("deepseek-")) {
    const apiKey = args.deepSeekApiKey?.trim() || "";
    if (!apiKey) throw new Error("Missing DeepSeek API key. Add it in AI Settings.");
    return runDeepSeekChatCompletion({
      apiKey,
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
    });
  }

  const apiKey = args.openRouterApiKey?.trim() || "";
  if (!apiKey) throw new Error("Missing OpenRouter API key. Add it in AI Settings.");
  return runOpenRouterChatCompletion({
    apiKey,
    model: args.model?.trim() || MODEL_BY_PROVIDER.nemotron || DEFAULT_MODEL,
    messages: args.messages,
    temperature: args.temperature,
  });
}

async function runDeepSeekChatCompletionStream(args: {
  apiKey: string;
  model: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
  onDelta: (delta: string) => Promise<void> | void;
}): Promise<{ text: string }> {
  const apiKey = args.apiKey?.trim() || "";
  if (!apiKey) {
    throw new Error("Missing DeepSeek API key. Add it in AI Settings.");
  }
  const model = args.model?.trim();
  if (!model) {
    throw new Error("DeepSeek model is required");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: toOpenRouterMessages(args.messages),
      temperature: args.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    const message = payload?.error?.message || payload?.message || "DeepSeek request failed";
    throw new Error(`${message}\n\nModel: ${model}`);
  }

  if (!response.body) {
    throw new Error(`DeepSeek streaming response body missing\n\nModel: ${model}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let json: {
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
        }>;
      } | null = null;
      try {
        json = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (!delta) continue;
      fullText += delta;
      await args.onDelta(delta);
    }
  }

  if (!fullText.trim()) {
    throw new Error("DeepSeek returned an empty response");
  }
  return { text: fullText.trim() };
}

async function runOpenRouterChatCompletionStream(args: {
  apiKey: string;
  model: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
  onDelta: (delta: string) => Promise<void> | void;
}): Promise<{ text: string; reasoningTokens?: number }> {
  const apiKey = args.apiKey?.trim() || "";
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key. Add it in AI Settings.");
  }
  const model = args.model?.trim() || MODEL_BY_PROVIDER.nemotron || DEFAULT_MODEL;
  if (model === "openrouter/free") {
    const openrouter = new OpenRouter({ apiKey });
    const stream = await openrouter.chat.send({
      chatRequest: {
        model,
        messages: toOpenRouterMessages(args.messages) as unknown as never,
        temperature: args.temperature ?? 0.7,
        stream: true,
      },
    });

    let fullText = "";
    let reasoningTokens: number | undefined;
    for await (const chunk of stream as AsyncIterable<{
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: { reasoningTokens?: number; reasoning_tokens?: number };
    }>) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        fullText += delta;
        await args.onDelta(delta);
      }
      const usage = chunk.usage;
      const nextReasoning =
        typeof usage?.reasoningTokens === "number"
          ? usage.reasoningTokens
          : typeof usage?.reasoning_tokens === "number"
            ? usage.reasoning_tokens
            : undefined;
      if (typeof nextReasoning === "number") reasoningTokens = nextReasoning;
    }

    if (!fullText.trim()) {
      throw new Error("OpenRouter returned an empty response");
    }
    return { text: fullText.trim(), reasoningTokens };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://oryx.local",
      "X-Title": "oryx",
    },
    body: JSON.stringify({
      model,
      messages: toOpenRouterMessages(args.messages),
      temperature: args.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    const message = payload?.error?.message || payload?.message || "OpenRouter request failed";
    const privacyBlocked =
      message.includes("No endpoints available matching your guardrail restrictions and data policy") ||
      message.includes("guardrail restrictions") ||
      message.includes("data policy");
    if (privacyBlocked) {
      throw new Error(
        `${message}\n\nModel: ${model}\n\nFix: Update your OpenRouter privacy/data policy settings to allow compatible endpoints: https://openrouter.ai/settings/privacy`,
      );
    }
    throw new Error(`${message}\n\nModel: ${model}`);
  }

  if (!response.body) {
    throw new Error(`OpenRouter streaming response body missing\n\nModel: ${model}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let json: {
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
        }>;
      } | null = null;
      try {
        json = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (!delta) continue;
      fullText += delta;
      await args.onDelta(delta);
    }
  }

  if (!fullText.trim()) {
    throw new Error("OpenRouter returned an empty response");
  }
  return { text: fullText.trim() };
}

export const sendThreadMessage = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const context = await ctx.runQuery(internal.deepDives.getThreadContext, { threadId: args.threadId });
    if (!context?.thread || !context.deepDive) {
      throw new Error("Thread not found");
    }

    const role = await ctx.runQuery(internal.deepDives.getRoleForTokenIdentifierInDeepDive, {
      deepDiveId: context.deepDive._id,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!role || (role !== "owner" && role !== "editor" && role !== "commenter")) {
      throw new Error("Unauthorized");
    }

    const latestText = getLatestUserText(context.messages ?? []);
    const cleaned = stripProviderMention(latestText);
    if (!cleaned.trim()) {
      throw new Error("Cannot send an empty message");
    }

    const allowedProviders = (context.deepDive.providers?.length ? context.deepDive.providers : DEFAULT_PROVIDERS)
      .map((provider) => normalizeProviderId(provider))
      .filter((provider): provider is AIProvider => Boolean(provider));
    const effectiveAllowed = allowedProviders.length ? allowedProviders : [...DEFAULT_PROVIDERS];
    const explicit = parseExplicitProvider(latestText);
    const picked = pickBestProvider({
      prompt: cleaned,
      history: (context.messages ?? []).slice(0, -1) as DeepDiveUIMessage[],
      allowed: effectiveAllowed,
    });
    const chosenProvider = explicit && effectiveAllowed.includes(explicit) ? explicit : picked.provider;
    const chosenModel =
      MODEL_BY_PROVIDER[chosenProvider] ??
      MODEL_BY_PROVIDER.nemotron ??
      DEFAULT_MODEL;
    let routingNote =
      explicit && effectiveAllowed.includes(explicit)
        ? undefined
        : `Answered by ${providerDisplayName(chosenProvider)} for ${picked.reason}.`;

    const openRouterApiKey = await resolveOpenRouterKey(ctx).catch(() => "");
    const geminiApiKey = await resolveGeminiKey(ctx).catch(() => "");
    const deepSeekApiKey = await resolveDeepSeekKey(ctx).catch(() => "");
    const rawMessages = (context.messages ?? []) as DeepDiveUIMessage[];
    const normalizedMessages: DeepDiveUIMessage[] = rawMessages.map((message) => {
      if (message.role !== "user") return message;
      const nextParts = message.parts.map((part) => {
        if (part.type === "text" && part.text === latestText) {
          return { ...part, text: cleaned };
        }
        return part;
      });
      return { ...message, parts: nextParts };
    });

    const providerOrder: AIProvider[] = [
      chosenProvider,
      ...effectiveAllowed.filter((provider) => provider !== chosenProvider),
    ];
    const candidateEntries: Array<{ provider: AIProvider; model: string }> = [];
    const seenModels = new Set<string>();
    for (const provider of providerOrder) {
      const isGemini = provider.startsWith("gemini-");
      const isDeepSeek = provider.startsWith("deepseek-");
      if (isGemini && !geminiApiKey) continue;
      if (isDeepSeek && !deepSeekApiKey) continue;
      if (!isGemini && !isDeepSeek && !openRouterApiKey) continue;
      const model = (MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL).trim();
      if (!model || seenModels.has(model)) continue;
      seenModels.add(model);
      candidateEntries.push({ provider, model });
    }
    if (candidateEntries.length === 0) {
      throw new Error("No usable model providers are configured. Add an OpenRouter, Gemini, or DeepSeek API key in AI Settings.");
    }

    let text = "";
    let answeredByProvider = chosenProvider;
    let answeredByModel = chosenModel;
    let lastError: unknown = null;
    const assistantMessageId = `msg-${Date.now()}-assistant`;

    for (const candidate of candidateEntries) {
      const model = candidate.model;
      const provider = candidate.provider;
      try {
        await ctx.runMutation(internal.deepDives.createAssistantDraft, {
          threadId: args.threadId,
          messageId: assistantMessageId,
          provider,
          model,
          routingNote,
        });
        await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
          threadId: args.threadId,
          messageId: assistantMessageId,
          text: "",
          done: false,
          provider,
          model,
          routingNote,
        });

        if (provider.startsWith("gemini-")) {
          text = await runGeminiGenerateContent({
            apiKey: geminiApiKey,
            model,
            messages: [formattingSystemMessage(), ...normalizedMessages],
          });
        } else if (provider.startsWith("deepseek-")) {
          let streamed = "";
          let lastFlushed = "";
          let lastFlushAt = 0;
          const flushDraft = async (force = false) => {
            if (!force) {
              const elapsed = Date.now() - lastFlushAt;
              const deltaChars = streamed.length - lastFlushed.length;
              if (elapsed < 600 && deltaChars < 120) return;
            }
            if (streamed === lastFlushed && !force) return;
            await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
              threadId: args.threadId,
              messageId: assistantMessageId,
              text: streamed,
              done: false,
              provider,
              model,
              routingNote,
            });
            lastFlushed = streamed;
            lastFlushAt = Date.now();
          };

          const result = await runDeepSeekChatCompletionStream({
            apiKey: deepSeekApiKey,
            model,
            messages: [formattingSystemMessage(), ...normalizedMessages],
            onDelta: async (delta) => {
              streamed += delta;
              await flushDraft(false);
            },
          });
          text = result.text;

          await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
            threadId: args.threadId,
            messageId: assistantMessageId,
            text,
            done: true,
            provider,
            model,
            routingNote,
          });
          answeredByProvider = provider;
          answeredByModel = model;
          break;
        } else {
          let streamed = "";
          let lastFlushed = "";
          let lastFlushAt = 0;
          const flushDraft = async (force = false) => {
            if (!force) {
              const elapsed = Date.now() - lastFlushAt;
              const deltaChars = streamed.length - lastFlushed.length;
              if (elapsed < 600 && deltaChars < 120) return;
            }
            if (streamed === lastFlushed && !force) return;
            await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
              threadId: args.threadId,
              messageId: assistantMessageId,
              text: streamed,
              done: false,
              provider,
              model,
              routingNote,
            });
            lastFlushed = streamed;
            lastFlushAt = Date.now();
          };

          const result = await runOpenRouterChatCompletionStream({
            apiKey: openRouterApiKey,
            model,
            messages: [formattingSystemMessage(), ...normalizedMessages],
            onDelta: async (delta) => {
              streamed += delta;
              await flushDraft(false);
            },
          });
          text = result.text;
          const reasoningTokens = result.reasoningTokens;

          await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
            threadId: args.threadId,
            messageId: assistantMessageId,
            text,
            done: true,
            provider,
            model,
            routingNote,
            reasoningTokens,
          });
          answeredByProvider = provider;
          answeredByModel = model;
          break;
        }

        await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
          threadId: args.threadId,
          messageId: assistantMessageId,
          text,
          done: true,
          provider,
          model,
          routingNote,
        });
        answeredByProvider = provider;
        answeredByModel = model;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error)) {
          throw error;
        }
      }
    }

    if (!text) {
      if (lastError instanceof Error) throw lastError;
      throw new Error("Unable to generate a response with the available models.");
    }

    if (answeredByProvider !== chosenProvider && !explicit) {
      if (isPrivacyBlockedError(lastError)) {
        routingNote = `Answered by ${providerDisplayName(answeredByProvider)} because ${providerDisplayName(chosenProvider)} was unavailable under current privacy policy.`;
      } else {
        routingNote = `Answered by ${providerDisplayName(answeredByProvider)} because ${providerDisplayName(chosenProvider)} was temporarily unavailable.`;
      }
    }

    await ctx.runMutation(internal.deepDives.updateAssistantDraft, {
      threadId: args.threadId,
      messageId: assistantMessageId,
      text,
      done: true,
      provider: answeredByProvider,
      model: answeredByModel,
      routingNote,
    });

    return { ok: true };
  },
});

export const runVote = action({
  args: {
    threadId: v.id("threads"),
    prompt: v.string(),
    participants: v.optional(v.array(v.string())),
    mode: v.optional(v.union(v.literal("quick"), v.literal("balanced"), v.literal("thorough"))),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const context = await ctx.runQuery(internal.deepDives.getThreadContext, { threadId: args.threadId });
      if (!context?.thread || !context.deepDive) {
        throw new Error("Thread not found");
      }

      const role = await ctx.runQuery(internal.deepDives.getRoleForTokenIdentifierInDeepDive, {
        deepDiveId: context.deepDive._id,
        tokenIdentifier: identity.tokenIdentifier,
      });
      if (!role || (role !== "owner" && role !== "editor")) {
        throw new Error("Unauthorized");
      }

      const participants = (args.participants?.length ? args.participants : DEFAULT_PROVIDERS)
        .map((provider) => normalizeProviderId(provider))
        .filter((provider): provider is AIProvider => Boolean(provider))
        .filter((provider, index, items) => items.indexOf(provider) === index);
      const mode: CouncilDepth = args.mode ?? "balanced";
      const cfg = councilDepthConfig(mode);
      const openRouterApiKey = await resolveOpenRouterKey(ctx).catch(() => "");
      const geminiApiKey = await resolveGeminiKey(ctx).catch(() => "");
      const deepSeekApiKey = await resolveDeepSeekKey(ctx).catch(() => "");
      const keyReadyParticipants = providersWithConfiguredKeys({
        providers: participants.length ? participants : [...DEFAULT_PROVIDERS],
        openRouterApiKey,
        geminiApiKey,
        deepSeekApiKey,
      });
      const effectiveParticipants = sortProvidersBySpeed(keyReadyParticipants).slice(0, cfg.members);
      if (effectiveParticipants.length === 0) {
        throw new Error("No vote providers are configured. Add an OpenRouter, Gemini, or DeepSeek API key in AI Settings.");
      }

      await ctx.runMutation(internal.deepDives.setVoteResults, {
        threadId: args.threadId,
        voteResults: [
          {
            provider: "glm-air",
            response: `Running vote (${mode})...`,
            reasoning: "In progress",
            votes: [],
          },
        ],
      });

      const orderedProviders = sortProvidersBySpeed(effectiveParticipants);
      const candidates = candidateModelsFromProviders(orderedProviders);

      const round1Settled = await Promise.allSettled(
        candidates.map((candidate) =>
          withTimeout(
            runCouncilMember({
              openRouterApiKey,
              geminiApiKey,
              deepSeekApiKey,
              prompt: args.prompt,
              phase: "round1",
              candidate,
              allowedProviders: orderedProviders,
              temperature: 0.5,
            }),
            cfg.perCallTimeoutMs,
            `Council member ${candidate.provider}`,
          ),
        ),
      );
      const round1: CouncilMemberResponse[] = round1Settled
        .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
        .map((r) => ({
          provider: r.provider,
          model: r.model,
          raw: r.raw,
          position: r.position,
          confidencePct: r.confidencePct,
        }));
      if (round1.length === 0) throw new Error("Vote unavailable right now. Please try again.");

      const proposalsText = round1
        .map((r) => `${r.provider} (${r.confidencePct}%):\n${r.raw}`)
        .join("\n\n---\n\n");
      const votesByChoice = Object.fromEntries(round1.map((r) => [r.provider, [] as AIProvider[]])) as Record<
        AIProvider,
        AIProvider[]
      >;

      if (mode !== "quick") {
        const ballotSettled = await Promise.allSettled(
          round1.map((voter) =>
            withTimeout(
              runChatCompletionWithFallback({
                openRouterApiKey,
                geminiApiKey,
                deepSeekApiKey,
                preferredProvider: voter.provider,
                allowedProviders: orderedProviders,
                temperature: 0.2,
                messages: [
                  userPromptMessage(
                    `vote-ballot-${voter.provider}`,
                    `Prompt: ${args.prompt}\n\nChoose the best proposal by returning only one provider id from: ${round1
                      .map((r) => r.provider)
                      .join(", ")}.\n\n${proposalsText}`,
                  ),
                ],
              }),
              cfg.perCallTimeoutMs,
              `Ballot ${voter.provider}`,
            ),
          ),
        );
        for (const item of ballotSettled) {
          if (item.status !== "fulfilled") continue;
          const normalized = item.value.text.toLowerCase();
          const winner = round1.find((r) => normalized.includes(r.provider));
          if (winner) votesByChoice[winner.provider].push(item.value.provider);
        }
      } else {
        for (const r of round1) votesByChoice[r.provider].push(r.provider);
      }

      const pm = await withTimeout(
        runChatCompletionWithFallback({
          openRouterApiKey,
          geminiApiKey,
          deepSeekApiKey,
          preferredProvider: orderedProviders[0] ?? "gemini-3-flash",
          allowedProviders: orderedProviders,
          temperature: 0.2,
          messages: [
            userPromptMessage(
              "vote-pm",
              pmSynthesisPrompt({ prompt: args.prompt, memberResponses: round1, roundLabel: "Round 1" }),
            ),
          ],
        }),
        cfg.perCallTimeoutMs,
        "Vote PM synthesis",
      );

      let freshEyes: { provider: AIProvider; text: string } | null = null;
      if (cfg.includeFreshEyes) {
        freshEyes = await withTimeout(
          runChatCompletionWithFallback({
            openRouterApiKey,
            geminiApiKey,
            deepSeekApiKey,
            preferredProvider: orderedProviders[0] ?? "gemini-3-flash",
            allowedProviders: orderedProviders,
            temperature: 0.25,
            messages: [
              userPromptMessage("vote-fresh-eyes", freshEyesPrompt({ prompt: args.prompt, finalAnswer: pm.text })),
            ],
          }),
          cfg.perCallTimeoutMs,
          "Vote fresh-eyes",
        ).catch(() => null);
      }

      await ctx.runMutation(internal.deepDives.setVoteResults, {
        threadId: args.threadId,
        voteResults: [
          ...round1.map((r) => ({
            provider: r.provider,
            response: r.raw,
            reasoning: `POSITION: ${r.position} • ${r.confidencePct}% confidence`,
            votes: votesByChoice[r.provider] ?? [],
          })),
          {
            provider: pm.provider,
            response: pm.text,
            reasoning: "PM synthesis",
            votes: [],
          },
          ...(freshEyes
            ? [
                {
                  provider: freshEyes.provider,
                  response: `## Fresh Eyes\n${freshEyes.text}`,
                  reasoning: "Fresh eyes validation",
                  votes: [],
                },
              ]
            : []),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vote failed";
      try {
        await ctx.runMutation(internal.deepDives.setVoteResults, {
          threadId: args.threadId,
          voteResults: [
            {
              provider: "glm-air",
              response: "Vote failed.",
              reasoning: message,
              votes: [],
            },
          ],
        });
      } catch (writeError) {
        void writeError;
      }
    }

    return { ok: true };
  },
});

export const runDebate = action({
  args: {
    threadId: v.id("threads"),
    prompt: v.string(),
    participants: v.optional(v.array(v.string())),
    mode: v.optional(v.union(v.literal("quick"), v.literal("balanced"), v.literal("thorough"))),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const context = await ctx.runQuery(internal.deepDives.getThreadContext, { threadId: args.threadId });
      if (!context?.thread || !context.deepDive) {
        throw new Error("Thread not found");
      }

      const role = await ctx.runQuery(internal.deepDives.getRoleForTokenIdentifierInDeepDive, {
        deepDiveId: context.deepDive._id,
        tokenIdentifier: identity.tokenIdentifier,
      });
      if (!role || (role !== "owner" && role !== "editor")) {
        throw new Error("Unauthorized");
      }

      const participants = (args.participants?.length ? args.participants : DEFAULT_PROVIDERS)
        .map((provider) => normalizeProviderId(provider))
        .filter((provider): provider is AIProvider => Boolean(provider))
        .filter((provider, index, items) => items.indexOf(provider) === index);
      const mode: CouncilDepth = args.mode ?? "balanced";
      const cfg = councilDepthConfig(mode);
      const openRouterApiKey = await resolveOpenRouterKey(ctx).catch(() => "");
      const geminiApiKey = await resolveGeminiKey(ctx).catch(() => "");
      const deepSeekApiKey = await resolveDeepSeekKey(ctx).catch(() => "");
      const keyReadyParticipants = providersWithConfiguredKeys({
        providers: participants.length ? participants : [...DEFAULT_PROVIDERS],
        openRouterApiKey,
        geminiApiKey,
        deepSeekApiKey,
      });
      const effectiveParticipants = sortProvidersBySpeed(keyReadyParticipants).slice(0, cfg.members);
      if (effectiveParticipants.length === 0) {
        throw new Error("No debate providers are configured. Add an OpenRouter, Gemini, or DeepSeek API key in AI Settings.");
      }
      const orderedProviders = sortProvidersBySpeed(effectiveParticipants);
      const candidates = candidateModelsFromProviders(orderedProviders);

      const transcript: Array<{ from: AIProvider; content: string }> = [];
      const teamworkMessages: Array<{ id: string; from: AIProvider; to: "all"; content: string; timestamp: number }> = [];

      teamworkMessages.push({
        id: `team-${Date.now()}-status`,
        from: "glm-air",
        to: "all",
        content: `Running debate (${mode})...`,
        timestamp: Date.now(),
      });
      await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
        threadId: args.threadId,
        teamworkMessages,
      });

      const round1Settled = await Promise.allSettled(
        candidates.map((candidate) =>
          withTimeout(
            runCouncilMember({
              openRouterApiKey,
              geminiApiKey,
              deepSeekApiKey,
              prompt: args.prompt,
              phase: "round1",
              candidate,
              allowedProviders: orderedProviders,
              temperature: 0.55,
            }),
            cfg.perCallTimeoutMs,
            `Council member ${candidate.provider}`,
          ),
        ),
      );
      const round1: CouncilMemberResponse[] = round1Settled
        .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
        .map((r) => ({
          provider: r.provider,
          model: r.model,
          raw: r.raw,
          position: r.position,
          confidencePct: r.confidencePct,
        }));

      for (const r of round1) {
        teamworkMessages.push({
          id: `team-${Date.now()}-r1-${r.provider}`,
          from: r.provider,
          to: "all",
          content: r.raw,
          timestamp: Date.now(),
        });
        transcript.push({ from: r.provider, content: r.raw });
      }
      await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
        threadId: args.threadId,
        teamworkMessages,
      });

      if (round1.length === 0) throw new Error("Debate unavailable right now. Please try again.");

      let pmSynthesis = await withTimeout(
        runChatCompletionWithFallback({
          openRouterApiKey,
          geminiApiKey,
          preferredProvider: orderedProviders[0] ?? "gemini-3-flash",
          allowedProviders: orderedProviders,
          temperature: 0.2,
          messages: [
            userPromptMessage(
              "debate-pm-r1",
              pmSynthesisPrompt({ prompt: args.prompt, memberResponses: round1, roundLabel: "Round 1" }),
            ),
          ],
        }),
        cfg.perCallTimeoutMs,
        "Debate PM synthesis round 1",
      );
      teamworkMessages.push({
        id: `team-${Date.now()}-pm-r1`,
        from: pmSynthesis.provider,
        to: "all",
        content: pmSynthesis.text,
        timestamp: Date.now(),
      });
      await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
        threadId: args.threadId,
        teamworkMessages,
      });

      for (let round = 2; round <= cfg.debateRounds + 1; round += 1) {
        const transcriptText = transcript
          .slice(-8)
          .map((t) => `${t.from}:\n${t.content}`)
          .join("\n\n---\n\n");
        const roundSettled = await Promise.allSettled(
          candidates.map((candidate) =>
            withTimeout(
              runCouncilMember({
                openRouterApiKey,
                geminiApiKey,
                deepSeekApiKey,
                prompt: `${args.prompt}\n\nPM synthesis so far:\n${pmSynthesis.text}`,
                phase: "round2",
                candidate,
                allowedProviders: orderedProviders,
                transcript: transcriptText,
                temperature: 0.5,
              }),
              cfg.perCallTimeoutMs,
              `Council member ${candidate.provider} (round ${round})`,
            ),
          ),
        );
        const roundResponses: CouncilMemberResponse[] = roundSettled
          .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
          .map((r) => ({
            provider: r.provider,
            model: r.model,
            raw: r.raw,
            position: r.position,
            confidencePct: r.confidencePct,
          }));

        for (const r of roundResponses) {
          teamworkMessages.push({
            id: `team-${Date.now()}-r${round}-${r.provider}`,
            from: r.provider,
            to: "all",
            content: r.raw,
            timestamp: Date.now(),
          });
          transcript.push({ from: r.provider, content: r.raw });
        }
        if (roundResponses.length > 0) {
          pmSynthesis = await withTimeout(
            runChatCompletionWithFallback({
              openRouterApiKey,
              geminiApiKey,
              deepSeekApiKey,
              preferredProvider: orderedProviders[0] ?? "gemini-3-flash",
              allowedProviders: orderedProviders,
              temperature: 0.2,
              messages: [
                userPromptMessage(
                  `debate-pm-r${round}`,
                  pmSynthesisPrompt({ prompt: args.prompt, memberResponses: roundResponses, roundLabel: `Round ${round}` }),
                ),
              ],
            }),
            cfg.perCallTimeoutMs,
            `Debate PM synthesis round ${round}`,
          );
          teamworkMessages.push({
            id: `team-${Date.now()}-pm-r${round}`,
            from: pmSynthesis.provider,
            to: "all",
            content: pmSynthesis.text,
            timestamp: Date.now(),
          });
        }
        await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
          threadId: args.threadId,
          teamworkMessages,
        });
      }

      const finalConsensus = await withTimeout(
        runChatCompletionWithFallback({
          openRouterApiKey,
          geminiApiKey,
          deepSeekApiKey,
          preferredProvider: orderedProviders[0] ?? "gemini-3-flash",
          allowedProviders: orderedProviders,
          temperature: 0.2,
          messages: [
            userPromptMessage(
              "debate-final",
              `Write a concise final conclusion based on the council.\n\nPrompt:\n${args.prompt}\n\nLatest PM synthesis:\n${pmSynthesis.text}\n\nOutput:\n## Final Consensus\n- Recommendation\n- Key reasons\n- Remaining disagreement (if any)`,
            ),
          ],
        }),
        cfg.perCallTimeoutMs,
        "Debate final consensus",
      );
      teamworkMessages.push({
        id: `team-${Date.now()}-consensus`,
        from: finalConsensus.provider,
        to: "all",
        content: finalConsensus.text,
        timestamp: Date.now(),
      });

      if (cfg.includeFreshEyes) {
        const freshEyes = await withTimeout(
          runChatCompletionWithFallback({
            openRouterApiKey,
            geminiApiKey,
            deepSeekApiKey,
            preferredProvider: orderedProviders[0] ?? "gemini-3-flash",
            allowedProviders: orderedProviders,
            temperature: 0.25,
            messages: [
              userPromptMessage("debate-fresh-eyes", freshEyesPrompt({ prompt: args.prompt, finalAnswer: finalConsensus.text })),
            ],
          }),
          cfg.perCallTimeoutMs,
          "Debate fresh-eyes",
        ).catch(() => null);
        if (freshEyes) {
          teamworkMessages.push({
            id: `team-${Date.now()}-fresh-eyes`,
            from: freshEyes.provider,
            to: "all",
            content: `## Fresh Eyes\n${freshEyes.text}`,
            timestamp: Date.now(),
          });
        }
      }

      await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
        threadId: args.threadId,
        teamworkMessages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Debate failed";
      try {
        await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
          threadId: args.threadId,
          teamworkMessages: [
            {
              id: `team-${Date.now()}-error`,
              from: "glm-air",
              to: "all",
              content: `Debate failed.\n\n${message}`,
              timestamp: Date.now(),
            },
          ],
        });
      } catch (writeError) {
        void writeError;
      }
    }

    return { ok: true };
  },
});
