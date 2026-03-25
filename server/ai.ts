import { convertToModelMessages, createIdGenerator, generateObject, generateText, streamText } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIProvider } from "../src/types/ai";
import type { DeepDiveUIMessage, TeamworkMessage, VoteResult } from "../src/lib/deep-dive-types";
import { resolveOpenRouterKey } from "./settings-store";

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

async function requireOpenRouterKey() {
  const apiKey = await resolveOpenRouterKey();
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY on the server.");
  }
  return apiKey;
}

async function getOpenRouter() {
  return createOpenRouter({
    apiKey: await requireOpenRouterKey(),
  });
}

export function parseExplicitProvider(input: string) {
  const match = input.match(/@([a-z0-9-]+)/i);
  const raw = match?.[1]?.toLowerCase();
  return raw ? labelToProvider[raw] : undefined;
}

export function stripProviderMention(input: string) {
  return input.replace(/@([a-z0-9-]+)/i, "").trim();
}

export function pickBestProvider(args: { prompt: string; history: DeepDiveUIMessage[]; allowed: AIProvider[] }) {
  const allowed = args.allowed.length ? args.allowed : (["gpt"] as AIProvider[]);
  const prompt = args.prompt.toLowerCase();
  const historyText = args.history
    .slice(-16)
    .flatMap(message => message.parts.filter(part => part.type === "text").map(part => part.text))
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

export function providerDisplayName(provider: AIProvider) {
  if (provider === "gpt") return "GPT";
  if (provider === "gemini") return "Llama";
  return "Nemotron";
}

export async function createThreadStream(args: {
  messages: DeepDiveUIMessage[];
  provider: AIProvider;
  routingNote?: string;
  onFinish?: (messages: DeepDiveUIMessage[]) => Promise<void> | void;
}) {
  const openrouter = await getOpenRouter();
  const modelMessages = await convertToModelMessages(args.messages);
  const result = streamText({
    model: openrouter(MODEL_BY_PROVIDER[args.provider]),
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: args.messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onFinish: async ({ messages }) => {
      await args.onFinish?.(messages as DeepDiveUIMessage[]);
    },
    messageMetadata: ({ part }) => {
      if (part.type === "start") {
        return {
          createdAt: Date.now(),
          provider: args.provider,
          model: MODEL_BY_PROVIDER[args.provider],
          routingNote: args.routingNote,
        };
      }

      if (part.type === "finish") {
        return {
          createdAt: Date.now(),
          provider: args.provider,
          model: MODEL_BY_PROVIDER[args.provider],
          routingNote: args.routingNote,
          totalTokens: part.totalUsage.totalTokens,
        };
      }

      return undefined;
    },
  });
}

const proposalSchema = z.object({
  response: z.string(),
  reasoning: z.string(),
});

const voteSchema = z.object({
  voteFor: z.string(),
  reason: z.string(),
});

export async function runVote(prompt: string, participants: AIProvider[]) {
  const openrouter = await getOpenRouter();

  const proposals = await Promise.all(
    participants.map(async provider => {
      const result = await generateObject({
        model: openrouter(MODEL_BY_PROVIDER[provider]),
        schema: proposalSchema,
        prompt: `Return a concise answer and reasoning for this prompt:\n\n${prompt}`,
      });

      return {
        provider,
        response: result.object.response.trim(),
        reasoning: result.object.reasoning.trim(),
      };
    }),
  );

  const votesByChoice: Record<AIProvider, AIProvider[]> = { gpt: [], gemini: [], claude: [] };
  const proposalsText = proposals.map(proposal => `- ${proposal.provider}: ${proposal.response}`).join("\n");

  await Promise.all(
    participants.map(async voter => {
      const result = await generateObject({
        model: openrouter(MODEL_BY_PROVIDER[voter]),
        schema: voteSchema,
        prompt: `Prompt: ${prompt}\n\nVote for the best proposal.\n${proposalsText}`,
      });
      const voteFor = result.object.voteFor as AIProvider;
      if (participants.includes(voteFor)) {
        votesByChoice[voteFor].push(voter);
      }
    }),
  );

  return proposals.map(
    proposal =>
      ({
        provider: proposal.provider,
        response: proposal.response,
        reasoning: proposal.reasoning,
        votes: votesByChoice[proposal.provider] ?? [],
      }) satisfies VoteResult,
  );
}

export async function runDebate(prompt: string, participants: AIProvider[]) {
  const openrouter = await getOpenRouter();

  const transcript: Array<{ from: AIProvider; content: string }> = [];
  const teamworkMessages: TeamworkMessage[] = [];

  for (const provider of participants) {
    const result = await generateText({
      model: openrouter(MODEL_BY_PROVIDER[provider]),
      prompt: `Prompt:\n${prompt}\n\nCurrent transcript:\n${transcript.map(item => `${item.from}: ${item.content}`).join("\n")}\n\nRespond as ${providerDisplayName(provider)}. Be concise and constructive.`,
    });
    const content = result.text.trim();
    teamworkMessages.push({
      id: generateId(),
      from: provider,
      to: "all",
      content,
      timestamp: Date.now(),
    });
    transcript.push({ from: provider, content });
  }

  return teamworkMessages;
}
