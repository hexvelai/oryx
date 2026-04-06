import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  deepDives: defineTable({
    userId: v.id("users"),
    title: v.string(),
    providers: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_updatedAt", ["userId", "updatedAt"]),

  deepDiveMemberships: defineTable({
    deepDiveId: v.id("deepDives"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("commenter"), v.literal("viewer")),
    invitedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_deepDiveId", ["deepDiveId"])
    .index("by_deepDiveId_and_userId", ["deepDiveId", "userId"]),

  deepDiveInvites: defineTable({
    deepDiveId: v.id("deepDives"),
    token: v.string(),
    email: v.optional(v.string()),
    role: v.union(v.literal("editor"), v.literal("commenter"), v.literal("viewer")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    usedAt: v.optional(v.number()),
    usedBy: v.optional(v.id("users")),
    declinedAt: v.optional(v.number()),
    declinedBy: v.optional(v.id("users")),
  })
    .index("by_token", ["token"])
    .index("by_deepDiveId", ["deepDiveId"])
    .index("by_email", ["email"]),

  humanChatMessages: defineTable({
    deepDiveId: v.id("deepDives"),
    authorUserId: v.id("users"),
    text: v.string(),
    replyToThreadMessageId: v.optional(v.string()),
    replyToExcerpt: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_deepDiveId_and_createdAt", ["deepDiveId", "createdAt"]),

  threads: defineTable({
    deepDiveId: v.id("deepDives"),
    title: v.string(),
    type: v.union(v.literal("chat"), v.literal("vote"), v.literal("teamwork")),
    messages: v.optional(v.array(v.any())),
    voteResults: v.optional(v.array(v.any())),
    teamworkMessages: v.optional(v.array(v.any())),
    createdByUserId: v.optional(v.string()),
    messageCount: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_deepDiveId_updatedAt", ["deepDiveId", "updatedAt"]),

  threadMessages: defineTable({
    deepDiveId: v.id("deepDives"),
    threadId: v.id("threads"),
    messageId: v.optional(v.string()),
    message: v.optional(v.any()),
    role: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    text: v.optional(v.string()),
    authorUserId: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
    authorImage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_threadId_and_createdAt", ["threadId", "createdAt"])
    .index("by_threadId_and_messageId", ["threadId", "messageId"])
    .index("by_deepDiveId_and_createdAt", ["deepDiveId", "createdAt"]),

  uploads: defineTable({
    deepDiveId: v.id("deepDives"),
    name: v.string(),
    type: v.string(),
    url: v.string(),
    createdAt: v.number(),
  }).index("by_deepDiveId_createdAt", ["deepDiveId", "createdAt"]),

  appSettings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
