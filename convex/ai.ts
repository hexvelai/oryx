"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { AIProvider } from "../src/types/ai";
import type { DeepDiveUIMessage } from "../src/lib/deep-dive-types";

const MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  gpt: "openai/gpt-oss-20b:free",
  gemini: "meta-llama/llama-3.3-70b-instruct:free",
  claude: "nvidia/nemotron-3-super-120b-a12b:free",
};

const labelToProvider: Record<string, AIProvider> = {
  gpt: "gpt",
  gemini: "gemini",
  claude: "claude",
  llama: "gemini",
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
  if (provider === "gemini") return "Llama";
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

function pickBestProvider(args: { prompt: string; history: DeepDiveUIMessage[]; allowed: AIProvider[] }) {
  const allowed = args.allowed.length ? args.allowed : (["gpt"] as AIProvider[]);
  const prompt = args.prompt.toLowerCase();
  const historyText = args.history
    .slice(-16)
    .flatMap((message) => message.parts.filter((part: any) => part.type === "text").map((part: any) => part.text))
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

async function resolveOpenRouterKey(ctx: any) {
  const stored = await ctx.runQuery(internal.settings.getOpenRouterKey, {});
  const envKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  const apiKey = stored || envKey;
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key. Add it in AI Settings.");
  }
  return apiKey;
}

function toOpenRouterMessages(messages: DeepDiveUIMessage[]) {
  return messages.flatMap((message) => {
    if (message.role === "system") {
      const text = message.parts.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n").trim();
      return text ? [{ role: "system", content: text }] : [];
    }

    if (message.role === "user") {
      const text = message.parts.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n").trim();
      return text ? [{ role: "user", content: text }] : [];
    }

    const text = message.parts
      .filter((part: any) => part.type === "text" || part.type === "reasoning")
      .map((part: any) => part.text)
      .join("\n")
      .trim();
    return text ? [{ role: "assistant", content: text }] : [];
  });
}

async function runChatCompletion(args: {
  apiKey: string;
  provider: AIProvider;
  messages: DeepDiveUIMessage[];
  temperature?: number;
}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://mozaic.local",
      "X-Title": "mozaic",
    },
    body: JSON.stringify({
      model: MODEL_BY_PROVIDER[args.provider],
      messages: toOpenRouterMessages(args.messages),
      temperature: args.temperature ?? 0.7,
    }),
  });

  const payload = await response.json().catch(() => null) as any;
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

export const sendThreadMessage = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const apiKey = await resolveOpenRouterKey(ctx);
    const context = await ctx.runQuery(internal.deepDives.getThreadContext, { threadId: args.threadId });
    if (!context?.thread || !context.deepDive) {
      throw new Error("Thread not found");
    }

    // Check ownership
    const user = await ctx.runQuery(internal.deepDives.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user || context.deepDive.userId !== user._id) {
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

    const normalizedMessages = (context.thread.messages ?? []).map((message: any) =>
      message.role === "user"
        ? {
            ...message,
            parts: message.parts.map((part: any) =>
              part.type === "text" && part.text === latestText ? { ...part, text: cleaned } : part,
            ),
          }
        : message,
    ) as DeepDiveUIMessage[];

    const text = await runChatCompletion({
      apiKey,
      provider: chosenProvider,
      messages: normalizedMessages,
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

    const user = await ctx.runQuery(internal.deepDives.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user || context.deepDive.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const apiKey = await resolveOpenRouterKey(ctx);
    const participants = (args.participants?.length ? args.participants : ["gpt", "gemini", "claude"]) as AIProvider[];

    const proposals = await Promise.all(
      participants.map(async (provider) => {
        const response = await runChatCompletion({
          apiKey,
          provider,
          messages: [
            {
              id: "vote-system",
              role: "user",
              parts: [{ type: "text", text: `Return a concise answer to this prompt, followed by a short sentence of reasoning.\n\nPrompt: ${args.prompt}` }],
            } as any,
          ],
          temperature: 0.6,
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
          apiKey,
          provider: voter,
          messages: [
            {
              id: "vote-ballot",
              role: "user",
              parts: [{ type: "text", text: `Prompt: ${args.prompt}\n\nChoose the best proposal by returning only one of: gpt, gemini, claude.\n\n${proposalsText}` }],
            } as any,
          ],
          temperature: 0.2,
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

    const user = await ctx.runQuery(internal.deepDives.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user || context.deepDive.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const apiKey = await resolveOpenRouterKey(ctx);
    const participants = (args.participants?.length ? args.participants : ["gpt", "gemini", "claude"]) as AIProvider[];
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
        apiKey,
        provider,
        messages: [
          {
            id: `debate-${provider}`,
            role: "user",
            parts: [{
              type: "text",
              text: `Prompt:\n${args.prompt}\n\nCurrent transcript:\n${transcript.map((item) => `${item.from}: ${item.content}`).join("\n")}\n\nRespond as ${providerDisplayName(provider)}. Be concise and constructive.`,
            }],
          } as any,
        ],
        temperature: 0.65,
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
