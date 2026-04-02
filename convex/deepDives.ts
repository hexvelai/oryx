import { action, mutation, query, internalMutation, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { AIProvider } from "../src/types/ai";
import type {
  DeepDiveRecord,
  DeepDiveRole,
  DeepDiveMember,
  DeepDiveThreadRecord,
  DeepDiveUIMessage,
  HumanChatMessage,
  SharedUploadRecord,
  TeamworkMessage,
  VoteResult,
} from "../src/lib/deep-dive-types";
import type { Doc, Id } from "./_generated/dataModel";

const PROVIDERS = [
  "nemotron",
  "dolphin",
  "qwen-coder",
  "glm-air",
  "trinity-mini",
  "qwen-plus",
  "step-flash",
  "gemini-3-flash",
  "gemini-2-flash",
] as const satisfies readonly AIProvider[];

const ROLE_RANK: Record<DeepDiveRole, number> = {
  owner: 3,
  editor: 2,
  commenter: 1,
  viewer: 0,
};

function maxRole(a: DeepDiveRole, b: DeepDiveRole) {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

async function getExistingUserId(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const identity = await requireIdentity(ctx);

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  return user?._id ?? null;
}

async function getOrCreateUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await requireIdentity(ctx);

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (user) return user._id;

  return await ctx.db.insert("users", {
    name: identity.name,
    email: identity.email,
    image: identity.pictureUrl,
    tokenIdentifier: identity.tokenIdentifier,
  });
}

function now() {
  return Date.now();
}

async function getRoleForUser(
  ctx: QueryCtx | MutationCtx,
  args: { deepDiveId: Id<"deepDives">; userId: Id<"users"> },
): Promise<DeepDiveRole | null> {
  const dive = await ctx.db.get(args.deepDiveId);
  if (!dive) return null;
  if (dive.userId === args.userId) return "owner";

  const membership = await ctx.db
    .query("deepDiveMemberships")
    .withIndex("by_deepDiveId_and_userId", (q) =>
      q.eq("deepDiveId", args.deepDiveId).eq("userId", args.userId),
    )
    .unique();

  return membership?.role ?? null;
}

function requireRole(role: DeepDiveRole | null, allowed: DeepDiveRole[]) {
  if (!role || !allowed.includes(role)) {
    throw new Error("Unauthorized");
  }
  return role;
}

function normalizeProviders(providers?: string[]) {
  const allowed = new Set<string>(PROVIDERS);
  const mapped = (providers ?? [])
    .filter(Boolean)
    .map((provider) => {
      if (allowed.has(provider)) return provider;
      if (provider === "claude") return "nemotron";
      return null;
    })
    .filter((provider): provider is string => Boolean(provider))
    .filter((provider, index, items) => items.indexOf(provider) === index);

  return (mapped.length ? mapped : [...PROVIDERS]) as AIProvider[];
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

function normalizeProviderId(provider: unknown): AIProvider | undefined {
  if (typeof provider !== "string") return undefined;
  const raw = provider.trim();
  if (!raw) return undefined;
  if (raw === "claude") return "nemotron";
  if ((PROVIDERS as readonly string[]).includes(raw)) return raw as AIProvider;
  return undefined;
}

function rowToThreadMessage(row: Doc<"threadMessages">): DeepDiveUIMessage | null {
  if (row.message) return row.message as DeepDiveUIMessage;
  const text = typeof (row as any).text === "string" ? ((row as any).text as string) : "";
  const role = typeof (row as any).role === "string" ? ((row as any).role as string) : "assistant";
  const createdAt = row.createdAt;
  if (!text.trim()) return null;
  const authorUserId = typeof (row as any).authorUserId === "string" ? ((row as any).authorUserId as string) : undefined;
  const authorName = typeof (row as any).authorName === "string" ? ((row as any).authorName as string) : undefined;
  const authorEmail = typeof (row as any).authorEmail === "string" ? ((row as any).authorEmail as string) : undefined;
  const authorImage = typeof (row as any).authorImage === "string" ? ((row as any).authorImage as string) : undefined;
  return {
    id: (row.messageId ?? `${row._id}`) as string,
    role: role === "user" || role === "system" || role === "assistant" ? role : "assistant",
    metadata: {
      createdAt,
      provider: normalizeProviderId((row as any).provider),
      model: typeof (row as any).model === "string" ? ((row as any).model as string) : undefined,
      author: authorUserId
        ? {
            userId: authorUserId,
            name: authorName,
            email: authorEmail,
            image: authorImage,
          }
        : undefined,
    },
    parts: [{ type: "text", text }],
  } satisfies DeepDiveUIMessage;
}

function rowToThread(row: Doc<"threads">): DeepDiveThreadRecord {
  return {
    id: row._id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: row.type,
    messages: [],
    voteResults: row.voteResults as VoteResult[] | undefined,
    teamworkMessages: row.teamworkMessages as TeamworkMessage[] | undefined,
  };
}

function rowToUpload(row: Doc<"uploads">): SharedUploadRecord {
  return {
    id: row._id,
    name: row.name,
    type: row.type,
    url: row.url,
    createdAt: row.createdAt,
  };
}

async function hydrateDeepDive(
  ctx: QueryCtx,
  deepDiveId: Id<"deepDives">,
  myRole: DeepDiveRole,
): Promise<DeepDiveRecord | null> {
  const dive = await ctx.db.get(deepDiveId);
  if (!dive) return null;

  const threads = await ctx.db
    .query("threads")
    .withIndex("by_deepDiveId_updatedAt", (q) => q.eq("deepDiveId", deepDiveId))
    .collect();
  const uploads = await ctx.db
    .query("uploads")
    .withIndex("by_deepDiveId_createdAt", (q) => q.eq("deepDiveId", deepDiveId))
    .collect();

  return {
    id: dive._id,
    title: dive.title,
    providers: normalizeProviders(dive.providers),
    createdAt: dive.createdAt,
    updatedAt: dive.updatedAt,
    myRole,
    threads: threads
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((thread) => rowToThread(thread)),
    uploads: uploads
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((upload) => rowToUpload(upload)),
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getExistingUserId(ctx);
    if (!userId) return [];

    const owned = await ctx.db
      .query("deepDives")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", userId))
      .collect();

    const memberships = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const diveIdToRole = new Map<Id<"deepDives">, DeepDiveRole>();
    for (const dive of owned) {
      diveIdToRole.set(dive._id, "owner");
    }

    for (const membership of memberships) {
      const existing = diveIdToRole.get(membership.deepDiveId);
      diveIdToRole.set(membership.deepDiveId, existing ? maxRole(existing, membership.role) : membership.role);
    }

    const dives: Array<{ dive: Doc<"deepDives">; role: DeepDiveRole }> = [];
    for (const [deepDiveId, role] of diveIdToRole) {
      const dive = await ctx.db.get(deepDiveId);
      if (dive) dives.push({ dive, role });
    }

    dives.sort((a, b) => b.dive.updatedAt - a.dive.updatedAt);
    const hydrated = await Promise.all(dives.map(({ dive, role }) => hydrateDeepDive(ctx, dive._id, role)));
    return hydrated.filter(Boolean) as DeepDiveRecord[];
  },
});

export const get = query({
  args: { diveId: v.id("deepDives") },
  handler: async (ctx, args) => {
    const userId = await getExistingUserId(ctx);
    if (!userId) return null;

    const role = await getRoleForUser(ctx, { deepDiveId: args.diveId, userId });
    if (!role) return null;
    return hydrateDeepDive(ctx, args.diveId, role);
  },
});

export const getThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<DeepDiveThreadRecord | null> => {
    const userId = await getExistingUserId(ctx);
    if (!userId) return null;

    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    const role = await getRoleForUser(ctx, { deepDiveId: thread.deepDiveId, userId });
    if (!role) return null;

    const messageRows = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_createdAt", (q) => q.eq("threadId", args.threadId))
      .collect();
    const messages = messageRows.length
      ? (messageRows.map((row) => rowToThreadMessage(row)).filter(Boolean) as DeepDiveUIMessage[])
      : ((thread.messages ?? []) as DeepDiveUIMessage[]);

    return {
      id: thread._id,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      type: thread.type,
      messages,
      voteResults: thread.voteResults as VoteResult[] | undefined,
      teamworkMessages: thread.teamworkMessages as TeamworkMessage[] | undefined,
    };
  },
});

export const createDeepDive = mutation({
  args: {
    title: v.optional(v.string()),
    providers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const timestamp = now();
    const deepDiveId = await ctx.db.insert("deepDives", {
      userId,
      title: args.title?.trim() || "New Project",
      providers: normalizeProviders(args.providers),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.insert("deepDiveMemberships", {
      deepDiveId,
      userId,
      role: "owner",
      createdAt: timestamp,
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
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

    const timestamp = now();
    const threadId = await ctx.db.insert("threads", {
      deepDiveId: args.deepDiveId,
      title: args.title?.trim() || "New thread",
      type: args.type ?? "chat",
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const seed = (args.seedMessages ?? []) as DeepDiveUIMessage[];
    for (const raw of seed) {
      const message = raw as DeepDiveUIMessage;
      const messageId = typeof message.id === "string" && message.id ? message.id : `msg-${timestamp}-${Math.random().toString(16).slice(2)}`;
      const createdAt =
        typeof message.metadata?.createdAt === "number" && Number.isFinite(message.metadata.createdAt)
          ? message.metadata.createdAt
          : timestamp;
      await ctx.db.insert("threadMessages", {
        deepDiveId: args.deepDiveId,
        threadId,
        messageId,
        message: { ...message, id: messageId } satisfies DeepDiveUIMessage,
        createdAt,
        updatedAt: createdAt,
      });
    }

    await ctx.db.patch(args.deepDiveId, { updatedAt: timestamp });
    return threadId;
  },
});

export const updateThreadTitle = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const role = await getRoleForUser(ctx, { deepDiveId: thread.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

    const trimmed = args.title.replace(/\s+/g, " ").trim();
    if (!trimmed) throw new Error("Thread title cannot be empty");

    const timestamp = now();
    await ctx.db.patch(args.threadId, {
      title: truncateTitle(trimmed),
      updatedAt: timestamp,
    });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});

export const updateDeepDiveTitle = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

    const trimmed = args.title.replace(/\s+/g, " ").trim();
    if (!trimmed) throw new Error("Project name cannot be empty");

    await ctx.db.patch(args.deepDiveId, {
      title: truncateTitle(trimmed),
      updatedAt: now(),
    });
  },
});

export const deleteThread = mutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const role = await getRoleForUser(ctx, { deepDiveId: thread.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

    const siblingThreads = await ctx.db
      .query("threads")
      .withIndex("by_deepDiveId_updatedAt", (q) => q.eq("deepDiveId", thread.deepDiveId))
      .collect();

    if (siblingThreads.length <= 1) {
      throw new Error("Projects must keep at least one thread");
    }

    const messages = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_createdAt", (q) => q.eq("threadId", args.threadId))
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(args.threadId);
    await ctx.db.patch(thread.deepDiveId, { updatedAt: now() });
  },
});

export const addUploads = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    files: v.array(v.object({ name: v.string(), type: v.string(), url: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

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
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

    await ctx.db.delete(args.uploadId);
    await ctx.db.patch(args.deepDiveId, { updatedAt: now() });
  },
});

export const deleteDeepDive = mutation({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner"]);

    const threadMessages = await ctx.db
      .query("threadMessages")
      .withIndex("by_deepDiveId_and_createdAt", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    for (const message of threadMessages) {
      await ctx.db.delete(message._id);
    }

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_deepDiveId_updatedAt", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    for (const thread of threads) {
      await ctx.db.delete(thread._id);
    }

    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_deepDiveId_createdAt", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    for (const upload of uploads) {
      await ctx.db.delete(upload._id);
    }

    const memberships = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_deepDiveId", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    const invites = await ctx.db
      .query("deepDiveInvites")
      .withIndex("by_deepDiveId", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }

    const humanMessages = await ctx.db
      .query("humanChatMessages")
      .withIndex("by_deepDiveId_and_createdAt", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    for (const message of humanMessages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(args.deepDiveId);
  },
});

export const migrateLegacyThreadMessages = action({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args): Promise<{ ok: true; migratedThreads: number; migratedMessages: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: true, migratedThreads: 0, migratedMessages: 0 };

    const role = await ctx.runQuery(internal.deepDives.getRoleForTokenIdentifierInDeepDive, {
      deepDiveId: args.deepDiveId,
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!role || (role !== "owner" && role !== "editor" && role !== "commenter")) {
      return { ok: true, migratedThreads: 0, migratedMessages: 0 };
    }

    const threadIds = await ctx.runQuery(internal.deepDives.listThreadIdsForDeepDive, { deepDiveId: args.deepDiveId });
    let migratedThreads = 0;
    let migratedMessages = 0;
    for (const threadId of threadIds) {
      const result = await ctx.runMutation(internal.deepDives.migrateThreadLegacyMessages, { threadId });
      if (result.migrated) migratedThreads += 1;
      migratedMessages += result.migratedMessages;
    }
    return { ok: true, migratedThreads, migratedMessages };
  },
});

export const appendUserMessage = mutation({
  args: {
    threadId: v.id("threads"),
    text: v.string(),
    replyToMessageId: v.optional(v.string()),
    replyToExcerpt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const role = await getRoleForUser(ctx, { deepDiveId: thread.deepDiveId, userId });
    requireRole(role, ["owner", "editor", "commenter"]);

    const trimmed = args.text.trim();
    if (!trimmed) return;

    const user = await ctx.db.get(userId);

    const timestamp = now();
    const hasNewMessages = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_createdAt", (q) => q.eq("threadId", args.threadId))
      .first();
    const legacy = (thread.messages ?? []) as DeepDiveUIMessage[];
    if (!hasNewMessages && legacy.length) {
      for (const [idx, raw] of legacy.entries()) {
        const message = raw as DeepDiveUIMessage;
        const messageId = typeof message.id === "string" && message.id ? message.id : `msg-${timestamp}-legacy-${idx}`;
        const createdAt =
          typeof message.metadata?.createdAt === "number" && Number.isFinite(message.metadata.createdAt)
            ? message.metadata.createdAt
            : timestamp + idx;
        await ctx.db.insert("threadMessages", {
          deepDiveId: thread.deepDiveId,
          threadId: args.threadId,
          messageId,
          message: { ...message, id: messageId } satisfies DeepDiveUIMessage,
          createdAt,
          updatedAt: createdAt,
        });
      }
      await ctx.db.patch(args.threadId, { messages: [] });
    }

    const messageId = `msg-${timestamp}-user`;
    const message: DeepDiveUIMessage = {
      id: messageId,
      role: "user",
      metadata: {
        author: {
          userId,
          name: user?.name,
          email: user?.email,
          image: user?.image,
        },
        replyTo: args.replyToMessageId
          ? {
              messageId: args.replyToMessageId,
              excerpt: args.replyToExcerpt?.trim() || undefined,
            }
          : undefined,
      },
      parts: [{ type: "text", text: trimmed }],
    };
    await ctx.db.insert("threadMessages", {
      deepDiveId: thread.deepDiveId,
      threadId: args.threadId,
      messageId,
      message,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const titleCandidate = truncateTitle(trimmed);
    const nextTitle = titleCandidate ? titleCandidate : thread.title;

    await ctx.db.patch(args.threadId, {
      updatedAt: timestamp,
      title: thread.title === "New thread" || thread.title === "Thread 1" ? nextTitle : thread.title,
    });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});

export const createInvite = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    email: v.optional(v.string()),
    role: v.union(v.literal("editor"), v.literal("commenter"), v.literal("viewer")),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const inviterId = await getOrCreateUserId(ctx);
    const inviterRole = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId: inviterId });
    requireRole(inviterRole, ["owner", "editor"]);

    const cleanedEmail = args.email?.trim().toLowerCase() || undefined;
    const timestamp = now();
    const expiresAt = Number.isFinite(args.expiresInDays)
      ? timestamp + Math.max(1, Math.min(30, Math.floor(args.expiresInDays ?? 7))) * 24 * 60 * 60 * 1000
      : timestamp + 7 * 24 * 60 * 60 * 1000;

    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${timestamp}-${Math.random().toString(16).slice(2)}`;

    await ctx.db.insert("deepDiveInvites", {
      deepDiveId: args.deepDiveId,
      token,
      email: cleanedEmail,
      role: args.role,
      createdBy: inviterId,
      createdAt: timestamp,
      expiresAt,
    });

    return { token };
  },
});

export const listInvites = query({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args) => {
    const userId = await getExistingUserId(ctx);
    if (!userId) return [];
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor"]);

    const invites = await ctx.db
      .query("deepDiveInvites")
      .withIndex("by_deepDiveId", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();

    return invites
      .filter((invite) => !invite.usedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((invite) => ({
        token: invite.token,
        email: invite.email ?? null,
        role: invite.role as "editor" | "commenter" | "viewer",
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt ?? null,
      }));
  },
});

export const listMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = identity.email?.trim().toLowerCase();
    if (!email) return [];

    const invites = await ctx.db
      .query("deepDiveInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    const fresh = invites
      .filter((invite) => !invite.usedAt)
      .filter((invite) => !invite.declinedAt)
      .filter((invite) => !invite.expiresAt || invite.expiresAt >= now())
      .sort((a, b) => b.createdAt - a.createdAt);

    const results: Array<{
      token: string;
      deepDiveId: Id<"deepDives">;
      title: string;
      role: "editor" | "commenter" | "viewer";
      createdAt: number;
      expiresAt: number | null;
    }> = [];

    for (const invite of fresh) {
      const dive = await ctx.db.get(invite.deepDiveId);
      if (!dive) continue;
      results.push({
        token: invite.token,
        deepDiveId: invite.deepDiveId,
        title: dive.title,
        role: invite.role as "editor" | "commenter" | "viewer",
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt ?? null,
      });
    }

    return results;
  },
});

export const declineInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const userId = await getOrCreateUserId(ctx);

    const token = args.token.trim();
    if (!token) throw new Error("Invalid invite token");

    const invite = await ctx.db
      .query("deepDiveInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite) throw new Error("Invite not found");
    if (invite.usedAt) throw new Error("Invite already used");
    if (invite.declinedAt) return { ok: true };
    if (invite.expiresAt && invite.expiresAt < now()) throw new Error("Invite expired");

    const inviteEmail = invite.email?.trim().toLowerCase();
    if (inviteEmail) {
      const email = identity.email?.trim().toLowerCase();
      if (!email) throw new Error("No email found for this account");
      if (inviteEmail !== email) throw new Error("This invite is for a different email");
    }

    await ctx.db.patch(invite._id, {
      declinedAt: now(),
      declinedBy: userId,
    });

    return { ok: true };
  },
});

export const getInviteInfo = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const token = args.token.trim();
    if (!token) return null;

    const invite = await ctx.db
      .query("deepDiveInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite) return null;
    if (invite.usedAt) return null;
    if (invite.declinedAt) return null;
    if (invite.expiresAt && invite.expiresAt < now()) return null;

    const inviteEmail = invite.email?.trim().toLowerCase();
    if (inviteEmail) {
      const userEmail = identity.email?.trim().toLowerCase();
      if (!userEmail || inviteEmail !== userEmail) return null;
    }

    const dive = await ctx.db.get(invite.deepDiveId);
    if (!dive) return null;

    return {
      token: invite.token,
      deepDiveId: invite.deepDiveId,
      title: dive.title,
      role: invite.role as "editor" | "commenter" | "viewer",
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt ?? null,
    };
  },
});

export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const userId = await getOrCreateUserId(ctx);

    const invite = await ctx.db
      .query("deepDiveInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (!invite) throw new Error("Invite not found");
    if (invite.usedAt) throw new Error("Invite already used");
    if (invite.declinedBy && invite.declinedBy === userId) throw new Error("Invite was declined");
    if (invite.expiresAt && invite.expiresAt < now()) throw new Error("Invite expired");

    const inviteEmail = invite.email?.trim().toLowerCase();
    const userEmail = identity.email?.trim().toLowerCase();
    if (inviteEmail && inviteEmail !== userEmail) {
      throw new Error("Invite was sent to a different email");
    }

    const already = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_deepDiveId_and_userId", (q) => q.eq("deepDiveId", invite.deepDiveId).eq("userId", userId))
      .unique();

    const timestamp = now();
    if (!already) {
      await ctx.db.insert("deepDiveMemberships", {
        deepDiveId: invite.deepDiveId,
        userId,
        role: invite.role,
        invitedBy: invite.createdBy,
        createdAt: timestamp,
      });
    }

    await ctx.db.patch(invite._id, { usedAt: timestamp, usedBy: userId });
    await ctx.db.patch(invite.deepDiveId, { updatedAt: timestamp });

    return { deepDiveId: invite.deepDiveId };
  },
});

export const leaveDeepDive = mutation({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    if (!role) return { ok: true };
    if (role === "owner") throw new Error("Owners cannot leave a project. Transfer ownership or delete it.");

    const membership = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_deepDiveId_and_userId", (q) => q.eq("deepDiveId", args.deepDiveId).eq("userId", userId))
      .unique();
    if (membership) {
      await ctx.db.delete(membership._id);
      await ctx.db.patch(args.deepDiveId, { updatedAt: now() });
    }

    return { ok: true };
  },
});

export const listMembers = query({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args): Promise<DeepDiveMember[]> => {
    const userId = await getExistingUserId(ctx);
    if (!userId) return [];
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor", "commenter", "viewer"]);

    const dive = await ctx.db.get(args.deepDiveId);
    if (!dive) return [];

    const memberships = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_deepDiveId", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();

    const memberByUserId = new Map<Id<"users">, DeepDiveRole>();
    memberByUserId.set(dive.userId, "owner");

    for (const membership of memberships) {
      const existing = memberByUserId.get(membership.userId);
      const normalizedRole: DeepDiveRole =
        membership.userId === dive.userId ? "owner" : (membership.role as DeepDiveRole);
      memberByUserId.set(membership.userId, existing ? maxRole(existing, normalizedRole) : normalizedRole);
    }

    const members: DeepDiveMember[] = [];
    for (const [memberUserId, memberRole] of memberByUserId) {
      const user = await ctx.db.get(memberUserId);
      members.push({
        userId: memberUserId,
        name: user?.name,
        email: user?.email,
        image: user?.image,
        role: memberRole,
      });
    }

    members.sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || (a.email ?? "").localeCompare(b.email ?? ""));
    return members;
  },
});

export const updateMemberRole = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    memberUserId: v.id("users"),
    role: v.union(v.literal("editor"), v.literal("commenter"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner"]);

    const dive = await ctx.db.get(args.deepDiveId);
    if (!dive) throw new Error("Project not found");
    if (args.memberUserId === dive.userId) throw new Error("Cannot change owner role");

    const membership = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_deepDiveId_and_userId", (q) => q.eq("deepDiveId", args.deepDiveId).eq("userId", args.memberUserId))
      .unique();
    if (!membership) throw new Error("Member not found");

    await ctx.db.patch(membership._id, { role: args.role });
  },
});

export const removeMember = mutation({
  args: { deepDiveId: v.id("deepDives"), memberUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner"]);

    const dive = await ctx.db.get(args.deepDiveId);
    if (!dive) throw new Error("Project not found");
    if (args.memberUserId === dive.userId) throw new Error("Cannot remove owner");

    const membership = await ctx.db
      .query("deepDiveMemberships")
      .withIndex("by_deepDiveId_and_userId", (q) => q.eq("deepDiveId", args.deepDiveId).eq("userId", args.memberUserId))
      .unique();
    if (!membership) return;

    await ctx.db.delete(membership._id);
  },
});

export const listHumanChatMessages = query({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args): Promise<HumanChatMessage[]> => {
    const userId = await getExistingUserId(ctx);
    if (!userId) return [];
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor", "commenter", "viewer"]);

    const rows = await ctx.db
      .query("humanChatMessages")
      .withIndex("by_deepDiveId_and_createdAt", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();

    const messages: HumanChatMessage[] = [];
    for (const row of rows) {
      const author = await ctx.db.get(row.authorUserId);
      messages.push({
        id: row._id,
        deepDiveId: row.deepDiveId,
        author: {
          userId: row.authorUserId,
          name: author?.name,
          email: author?.email,
          image: author?.image,
        },
        text: row.text,
        replyTo: row.replyToThreadMessageId
          ? {
              threadMessageId: row.replyToThreadMessageId,
              excerpt: row.replyToExcerpt ?? undefined,
            }
          : undefined,
        createdAt: row.createdAt,
      });
    }

    return messages;
  },
});

export const sendHumanChatMessage = mutation({
  args: {
    deepDiveId: v.id("deepDives"),
    text: v.string(),
    replyToThreadMessageId: v.optional(v.string()),
    replyToExcerpt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getOrCreateUserId(ctx);
    const role = await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId });
    requireRole(role, ["owner", "editor", "commenter"]);

    const trimmed = args.text.trim();
    if (!trimmed) return;

    const timestamp = now();
    await ctx.db.insert("humanChatMessages", {
      deepDiveId: args.deepDiveId,
      authorUserId: userId,
      text: trimmed,
      replyToThreadMessageId: args.replyToThreadMessageId?.trim() || undefined,
      replyToExcerpt: args.replyToExcerpt?.trim() || undefined,
      createdAt: timestamp,
    });
    await ctx.db.patch(args.deepDiveId, { updatedAt: timestamp });
  },
});

export const getUserByTokenIdentifier = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});

export const getRoleForTokenIdentifierInDeepDive = internalQuery({
  args: { deepDiveId: v.id("deepDives"), tokenIdentifier: v.string() },
  handler: async (ctx, args): Promise<DeepDiveRole | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (!user) return null;
    return await getRoleForUser(ctx, { deepDiveId: args.deepDiveId, userId: user._id });
  },
});

export const getThreadMessages = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<DeepDiveUIMessage[]> => {
    const rows = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_createdAt", (q) => q.eq("threadId", args.threadId))
      .collect();
    return rows.map((row) => rowToThreadMessage(row)).filter(Boolean) as DeepDiveUIMessage[];
  },
});

export const getThreadContext = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const deepDive = await ctx.db.get(thread.deepDiveId);
    const threadMessages = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_createdAt", (q) => q.eq("threadId", args.threadId))
      .collect();
    const messages = threadMessages.length
      ? (threadMessages.map((row) => rowToThreadMessage(row)).filter(Boolean) as DeepDiveUIMessage[])
      : ((thread.messages ?? []) as DeepDiveUIMessage[]);
    return { thread, deepDive, messages };
  },
});

export const listThreadIdsForDeepDive = internalQuery({
  args: { deepDiveId: v.id("deepDives") },
  handler: async (ctx, args): Promise<Array<Id<"threads">>> => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_deepDiveId_updatedAt", (q) => q.eq("deepDiveId", args.deepDiveId))
      .collect();
    return threads.map((thread) => thread._id);
  },
});

export const migrateThreadLegacyMessages = internalMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<{ migrated: boolean; migratedMessages: number }> => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return { migrated: false, migratedMessages: 0 };

    const hasNewMessages = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_createdAt", (q) => q.eq("threadId", args.threadId))
      .first();
    if (hasNewMessages) {
      if ((thread.messages ?? []).length > 0) {
        await ctx.db.patch(args.threadId, { messages: [] });
      }
      return { migrated: false, migratedMessages: 0 };
    }

    const legacy = (thread.messages ?? []) as DeepDiveUIMessage[];
    if (!legacy.length) return { migrated: false, migratedMessages: 0 };

    const timestamp = now();
    const used = new Set<string>();
    let migratedMessages = 0;

    for (const [idx, raw] of legacy.entries()) {
      const message = raw as DeepDiveUIMessage;
      let messageId = typeof message.id === "string" && message.id ? message.id : `msg-${timestamp}-legacy-${idx}`;
      while (used.has(messageId)) {
        messageId = `${messageId}-${idx}`;
      }
      used.add(messageId);
      const createdAt =
        typeof message.metadata?.createdAt === "number" && Number.isFinite(message.metadata.createdAt)
          ? message.metadata.createdAt
          : thread.createdAt + idx;
      await ctx.db.insert("threadMessages", {
        deepDiveId: thread.deepDiveId,
        threadId: args.threadId,
        messageId,
        message: { ...message, id: messageId } satisfies DeepDiveUIMessage,
        createdAt,
        updatedAt: createdAt,
      });
      migratedMessages += 1;
    }

    await ctx.db.patch(args.threadId, { messages: [] });
    return { migrated: true, migratedMessages };
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
    await ctx.db.insert("threadMessages", {
      deepDiveId: thread.deepDiveId,
      threadId: args.threadId,
      messageId: `msg-${timestamp}-assistant`,
      message: {
        id: `msg-${timestamp}-assistant`,
        role: "assistant",
        metadata: {
          createdAt: timestamp,
          provider: args.provider as AIProvider,
          model: args.model,
          routingNote: args.routingNote,
        },
        parts: [{ type: "text", text: args.text }],
      } satisfies DeepDiveUIMessage,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.patch(args.threadId, { updatedAt: timestamp });
    await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
  },
});

export const createAssistantDraft = internalMutation({
  args: {
    threadId: v.id("threads"),
    messageId: v.string(),
    provider: v.string(),
    model: v.string(),
    routingNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const timestamp = now();
    const existing = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_messageId", (q) => q.eq("threadId", args.threadId).eq("messageId", args.messageId))
      .unique();
    if (existing) return;

    await ctx.db.insert("threadMessages", {
      deepDiveId: thread.deepDiveId,
      threadId: args.threadId,
      messageId: args.messageId,
      message: {
        id: args.messageId,
        role: "assistant",
        metadata: {
          createdAt: timestamp,
          provider: args.provider as AIProvider,
          model: args.model,
          routingNote: args.routingNote,
          done: false,
        },
        parts: [{ type: "text", text: "" }],
      } satisfies DeepDiveUIMessage,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const updateAssistantDraft = internalMutation({
  args: {
    threadId: v.id("threads"),
    messageId: v.string(),
    text: v.string(),
    done: v.optional(v.boolean()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    routingNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const timestamp = now();
    const row = await ctx.db
      .query("threadMessages")
      .withIndex("by_threadId_and_messageId", (q) => q.eq("threadId", args.threadId).eq("messageId", args.messageId))
      .unique();
    if (!row) return;

    const target = row.message as DeepDiveUIMessage;
    const nextMessage: DeepDiveUIMessage = {
      ...target,
      parts: [{ type: "text", text: args.text }],
      metadata: {
        ...(target.metadata ?? {}),
        provider: args.provider ?? (target.metadata?.provider as string | undefined),
        model: args.model ?? (target.metadata?.model as string | undefined),
        routingNote: args.routingNote ?? (target.metadata?.routingNote as string | undefined),
        done: args.done ?? false,
      } as DeepDiveUIMessage["metadata"],
    };

    await ctx.db.patch(row._id, {
      message: nextMessage,
      updatedAt: timestamp,
    });

    if (args.done) {
      await ctx.db.patch(args.threadId, { updatedAt: timestamp });
      await ctx.db.patch(thread.deepDiveId, { updatedAt: timestamp });
    }
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
