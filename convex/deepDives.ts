import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { AIProvider } from "../src/types/ai";
import type {
  DeepDiveRecord,
  DeepDiveThreadRecord,
  DeepDiveUIMessage,
  SharedUploadRecord,
  TeamworkMessage,
  VoteResult,
} from "../src/lib/deep-dive-types";

const PROVIDERS = ["gpt", "gemini", "claude"] as const satisfies readonly AIProvider[];

function now() {
  return Date.now();
}

function normalizeProviders(providers?: string[]) {
  const next = (providers ?? []).filter(Boolean).filter((provider, index, items) => items.indexOf(provider) === index);
  return (next.length ? next : [...PROVIDERS]) as AIProvider[];
}

function truncateTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 56 ? `${normalized.slice(0, 55)}...` : normalized;
}

function firstTextPart(message: DeepDiveUIMessage | undefined) {
  if (!message) return "";
  for (const part of message.parts as Array<{ type?: string; text?: string }>) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      return part.text.trim();
    }
  }
  return "";
}

function rowToThread(row: {
  _id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  type: "chat" | "vote" | "teamwork";
  messages: DeepDiveUIMessage[];
  voteResults?: VoteResult[];
  teamworkMessages?: TeamworkMessage[];
}): DeepDiveThreadRecord {
  return {
    id: row._id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: row.type,
    messages: row.messages ?? [],
    voteResults: row.voteResults,
    teamworkMessages: row.teamworkMessages,
  };
}

function rowToUpload(row: {
  _id: string;
  name: string;
  type: string;
  url: string;
  createdAt: number;
}): SharedUploadRecord {
  return {
    id: row._id,
    name: row.name,
    type: row.type,
    url: row.url,
    createdAt: row.createdAt,
  };
}

async function hydrateDeepDive(ctx: any, deepDiveId: string): Promise<DeepDiveRecord | null> {
  const dive = await ctx.db.get(deepDiveId);
  if (!dive) return null;

  const threads = await ctx.db
    .query("threads")
    .withIndex("by_deepDiveId_updatedAt", (q: any) => q.eq("deepDiveId", deepDiveId))
    .collect();
  const uploads = await ctx.db
    .query("uploads")
    .withIndex("by_deepDiveId_createdAt", (q: any) => q.eq("deepDiveId", deepDiveId))
    .collect();

  return {
    id: dive._id,
    title: dive.title,
    providers: normalizeProviders(dive.providers),
    createdAt: dive.createdAt,
    updatedAt: dive.updatedAt,
    threads: threads
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
      .map((thread: any) => rowToThread(thread)),
    uploads: uploads
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .map((upload: any) => rowToUpload(upload)),
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const dives = await ctx.db.query("deepDives").collect();
    const hydrated = await Promise.all(
      dives
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((dive) => hydrateDeepDive(ctx, dive._id)),
    );
    return hydrated.filter(Boolean) as DeepDiveRecord[];
  },
});

export const get = query({
  args: { diveId: v.id("deepDives") },
  handler: async (ctx, args) => {
    return hydrateDeepDive(ctx, args.diveId);
  },
});

export const createDeepDive = mutation({
  args: {
    title: v.optional(v.string()),
    providers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const deepDiveId = await ctx.db.insert("deepDives", {
      title: args.title?.trim() || "New Deep Dive",
      providers: normalizeProviders(args.providers),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.insert("threads", {
      deepDiveId,
      title: "Thread 1",
      type: "chat",
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return deepDiveId;
  },
});

export const createThread = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    title: v.optional(v.string()),
    type: v.optional(v.union(v.literal("chat"), v.literal("vote"), v.literal("teamwork"))),
    seedMessages: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const threadId = await ctx.db.insert("threads", {
      deepDiveId: args.deepDiveId,
      title: args.title?.trim() || "New thread",
      type: args.type ?? "chat",
      messages: (args.seedMessages ?? []) as DeepDiveUIMessage[],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.patch(args.deepDiveId, { updatedAt: timestamp });
    return threadId;
  },
});

export const addUploads = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    files: v.array(v.object({ name: v.string(), type: v.string(), url: v.string() })),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    for (const file of args.files) {
      await ctx.db.insert("uploads", {
        deepDiveId: args.deepDiveId,
        name: file.name,
        type: file.type,
        url: file.url,
        createdAt: timestamp,
      });
    }
    await ctx.db.patch(args.deepDiveId, { updatedAt: timestamp });
  },
});

export const removeUpload = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    uploadId: v.id("uploads"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.uploadId);
    await ctx.db.patch(args.deepDiveId, { updatedAt: now() });
  },
});

export const appendUserMessage = mutation({
  args: {
    threadId: v.id("threads"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const timestamp = now();
    const nextMessages = [
      ...(thread.messages ?? []),
      {
        id: `msg-${timestamp}-user`,
        role: "user",
        parts: [{ type: "text", text: args.text.trim() }],
      },
    ] as DeepDiveUIMessage[];

    const titleCandidate = firstTextPart(nextMessages.find((message) => message.role === "user"));
    const nextTitle = titleCandidate ? truncateTitle(titleCandidate) : thread.title;

    await ctx.db.patch(args.threadId, {
      messages: nextMessages,
      updatedAt: timestamp,
      title: thread.title === "New thread" || thread.title === "Thread 1" ? nextTitle : thread.title,
    });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});

export const getThreadContext = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const deepDive = await ctx.db.get(thread.deepDiveId);
    return { thread, deepDive };
  },
});

export const appendAssistantMessage = internalMutation({
  args: {
    threadId: v.id("threads"),
    provider: v.string(),
    model: v.string(),
    routingNote: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const timestamp = now();
    const nextMessages = [
      ...(thread.messages ?? []),
      {
        id: `msg-${timestamp}-assistant`,
        role: "assistant",
        metadata: {
          createdAt: timestamp,
          provider: args.provider,
          model: args.model,
          routingNote: args.routingNote,
        },
        parts: [{ type: "text", text: args.text }],
      },
    ] as DeepDiveUIMessage[];

    await ctx.db.patch(args.threadId, {
      messages: nextMessages,
      updatedAt: timestamp,
    });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});

export const setVoteResults = internalMutation({
  args: {
    threadId: v.id("threads"),
    voteResults: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    const timestamp = now();
    await ctx.db.patch(args.threadId, {
      voteResults: args.voteResults as VoteResult[],
      updatedAt: timestamp,
    });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});

export const setTeamworkMessages = internalMutation({
  args: {
    threadId: v.id("threads"),
    teamworkMessages: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    const timestamp = now();
    await ctx.db.patch(args.threadId, {
      teamworkMessages: args.teamworkMessages as TeamworkMessage[],
      updatedAt: timestamp,
    });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});
