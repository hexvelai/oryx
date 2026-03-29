import { mutation, query, internalMutation, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
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

const PROVIDERS = ["gpt", "gemini", "claude"] as const satisfies readonly AIProvider[];

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

function rowToThread(row: Doc<"threads">): DeepDiveThreadRecord {
  return {
    id: row._id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: row.type,
    messages: (row.messages ?? []) as DeepDiveUIMessage[],
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
      messages: (args.seedMessages ?? []) as DeepDiveUIMessage[],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

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
    const authorName = (user?.name || user?.email || "Human").toString();

    const timestamp = now();
    const nextMessages = [
      ...(thread.messages ?? []),
      {
        id: `msg-${timestamp}-user`,
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
