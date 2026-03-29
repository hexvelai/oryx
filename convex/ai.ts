"use node";

import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { AIProvider } from "../src/types/ai";
import type { DeepDiveUIMessage } from "../src/lib/deep-dive-types";

const MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  gpt: "openai/gpt-oss-20b:free",
  gemini: "gemini-1.5-flash",
  claude: "nvidia/nemotron-3-super-120b-a12b:free",
};

const labelToProvider: Record<string, AIProvider> = {
  gpt: "gpt",
  gemini: "gemini",
  claude: "claude",
  flash: "gemini",
  nemotron: "claude",
};

function parseExplicitProvider(input: string) {
  const match = input.match(/@([a-z0-9-]+)/i);
  const raw = match?.[1]?.toLowerCase();
  return raw ? labelToProvider[raw] : undefined;
}

function stripProviderMention(input: string) {
  return input.replace(/@([a-z0-9-]+)/i, "").trim();
}

function providerDisplayName(provider: AIProvider) {
  if (provider === "gpt") return "GPT";
  if (provider === "gemini") return "Gemini";
  return "Nemotron";
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
  const allowed = args.allowed.length ? args.allowed : (["gpt"] as AIProvider[]);
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
    provider: allowed.includes(provider) ? provider : (allowed[0] ?? "gpt"),
    reason,
  });

  if (hasCodeSignals) return choose("gpt", "coding and debugging");
  if (wantsWriting) return choose("claude", "writing and synthesis");
  if (refersBack || isLongTurn) return choose("claude", "longer context continuity");
  if (wantsFastQa) return choose("gemini", "fast question answering");
  return choose("gpt", "general reasoning");
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

function toGeminiRequest(messages: DeepDiveUIMessage[]) {
  const openRouterMessages = toOpenRouterMessages(messages);
  const systemText = openRouterMessages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const contents = openRouterMessages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: message.content }],
    }));

  return {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents,
  };
}

async function runGeminiChatCompletion(args: {
  apiKey: string;
  messages: DeepDiveUIMessage[];
  temperature?: number;
}) {
  const request = toGeminiRequest(args.messages);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_BY_PROVIDER.gemini}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...request,
        generationConfig: {
          temperature: args.temperature ?? 0.7,
        },
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      }
    | null;
  if (!response.ok) {
    const message = payload?.error?.message || "Gemini request failed";
    throw new Error(message);
  }

  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
}

async function runOpenRouterChatCompletion(args: {
  apiKey: string;
  provider: Exclude<AIProvider, "gemini">;
  messages: DeepDiveUIMessage[];
  temperature?: number;
}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://oryx.local",
      "X-Title": "oryx",
    },
    body: JSON.stringify({
      model: MODEL_BY_PROVIDER[args.provider],
      messages: toOpenRouterMessages(args.messages),
      temperature: args.temperature ?? 0.7,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        message?: string;
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "OpenRouter request failed";
    throw new Error(message);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text.trim();
}

async function resolveApiKeys(ctx: ActionCtx, providers: AIProvider[]) {
  const needsGemini = providers.includes("gemini");
  const needsOpenRouter = providers.some((provider) => provider !== "gemini");

  const [geminiApiKey, openRouterApiKey] = await Promise.all([
    needsGemini ? resolveGeminiKey(ctx) : Promise.resolve(undefined),
    needsOpenRouter ? resolveOpenRouterKey(ctx) : Promise.resolve(undefined),
  ]);

  return { geminiApiKey, openRouterApiKey };
}

async function runChatCompletion(args: {
  provider: AIProvider;
  messages: DeepDiveUIMessage[];
  temperature?: number;
  geminiApiKey?: string;
  openRouterApiKey?: string;
}) {
  if (args.provider === "gemini") {
    const apiKey = args.geminiApiKey?.trim() || "";
    if (!apiKey) throw new Error("Missing Gemini API key. Add it in AI Settings.");
    return runGeminiChatCompletion({
      apiKey,
      messages: args.messages,
      temperature: args.temperature,
    });
  }

  const apiKey = args.openRouterApiKey?.trim() || "";
  if (!apiKey) throw new Error("Missing OpenRouter API key. Add it in AI Settings.");
  return runOpenRouterChatCompletion({
    apiKey,
    provider: args.provider,
    messages: args.messages,
    temperature: args.temperature,
  });
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

    const latestText = getLatestUserText(context.thread.messages ?? []);
    const cleaned = stripProviderMention(latestText);
    if (!cleaned.trim()) {
      throw new Error("Cannot send an empty message");
    }

    const allowedProviders = (context.deepDive.providers?.length ? context.deepDive.providers : ["gpt", "gemini", "claude"]) as AIProvider[];
    const explicit = parseExplicitProvider(latestText);
    const picked = pickBestProvider({
      prompt: cleaned,
      history: (context.thread.messages ?? []).slice(0, -1) as DeepDiveUIMessage[],
      allowed: allowedProviders,
    });
    const chosenProvider = explicit && allowedProviders.includes(explicit) ? explicit : picked.provider;
    const routingNote =
      explicit && allowedProviders.includes(explicit)
        ? undefined
        : `Answered by ${providerDisplayName(chosenProvider)} for ${picked.reason}.`;

    const { geminiApiKey, openRouterApiKey } = await resolveApiKeys(ctx, [chosenProvider]);
    const rawMessages = (context.thread.messages ?? []) as DeepDiveUIMessage[];
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

    const text = await runChatCompletion({
      provider: chosenProvider,
      messages: [formattingSystemMessage(), ...normalizedMessages],
      geminiApiKey,
      openRouterApiKey,
    });

    await ctx.runMutation(internal.deepDives.appendAssistantMessage, {
      threadId: args.threadId,
      provider: chosenProvider,
      model: MODEL_BY_PROVIDER[chosenProvider],
      routingNote,
      text,
    });

    return { ok: true };
  },
});

export const runVote = action({
  args: {
    threadId: v.id("threads"),
    prompt: v.string(),
    participants: v.optional(v.array(v.string())),
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
    if (!role || (role !== "owner" && role !== "editor")) {
      throw new Error("Unauthorized");
    }

    const participants = (args.participants?.length ? args.participants : ["gpt", "gemini", "claude"]) as AIProvider[];
    const { geminiApiKey, openRouterApiKey } = await resolveApiKeys(ctx, participants);

    const proposals = await Promise.all(
      participants.map(async (provider) => {
        const response = await runChatCompletion({
          provider,
          messages: [
            userPromptMessage(
              "vote-system",
              `Return a concise answer to this prompt, followed by a short sentence of reasoning.\n\nPrompt: ${args.prompt}`,
            ),
          ],
          temperature: 0.6,
          geminiApiKey,
          openRouterApiKey,
        });

        return {
          provider,
          response,
          reasoning: `Drafted by ${providerDisplayName(provider)}.`,
        };
      }),
    );

    const votesByChoice: Record<AIProvider, AIProvider[]> = { gpt: [], gemini: [], claude: [] };
    const proposalsText = proposals.map((proposal) => `${proposal.provider}: ${proposal.response}`).join("\n\n");

    await Promise.all(
      participants.map(async (voter) => {
        const ballot = await runChatCompletion({
          provider: voter,
          messages: [
            userPromptMessage(
              "vote-ballot",
              `Prompt: ${args.prompt}\n\nChoose the best proposal by returning only one of: gpt, gemini, claude.\n\n${proposalsText}`,
            ),
          ],
          temperature: 0.2,
          geminiApiKey,
          openRouterApiKey,
        });

        const normalized = ballot.toLowerCase();
        const winner = (["gpt", "gemini", "claude"] as AIProvider[]).find((provider) => normalized.includes(provider));
        if (winner && participants.includes(winner)) {
          votesByChoice[winner].push(voter);
        }
      }),
    );

    await ctx.runMutation(internal.deepDives.setVoteResults, {
      threadId: args.threadId,
      voteResults: proposals.map((proposal) => ({
        provider: proposal.provider,
        response: proposal.response,
        reasoning: proposal.reasoning,
        votes: votesByChoice[proposal.provider] ?? [],
      })),
    });

    return { ok: true };
  },
});

export const runDebate = action({
  args: {
    threadId: v.id("threads"),
    prompt: v.string(),
    participants: v.optional(v.array(v.string())),
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
    if (!role || (role !== "owner" && role !== "editor")) {
      throw new Error("Unauthorized");
    }

    const participants = (args.participants?.length ? args.participants : ["gpt", "gemini", "claude"]) as AIProvider[];
    const { geminiApiKey, openRouterApiKey } = await resolveApiKeys(ctx, participants);
    const transcript: Array<{ from: AIProvider; content: string }> = [];

    const teamworkMessages = [] as Array<{
      id: string;
      from: AIProvider;
      to: "all";
      content: string;
      timestamp: number;
    }>;

    for (const provider of participants) {
      const content = await runChatCompletion({
        provider,
        messages: [
          userPromptMessage(
            `debate-${provider}`,
            `Prompt:\n${args.prompt}\n\nCurrent transcript:\n${transcript.map((item) => `${item.from}: ${item.content}`).join("\n")}\n\nRespond as ${providerDisplayName(provider)}. Be concise and constructive.`,
          ),
        ],
        temperature: 0.65,
        geminiApiKey,
        openRouterApiKey,
      });

      teamworkMessages.push({
        id: `team-${Date.now()}-${provider}`,
        from: provider,
        to: "all",
        content,
        timestamp: Date.now(),
      });
      transcript.push({ from: provider, content });
    }

    await ctx.runMutation(internal.deepDives.setTeamworkMessages, {
      threadId: args.threadId,
      teamworkMessages,
    });

    return { ok: true };
  },
});
