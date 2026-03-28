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

  threads: defineTable({
    deepDiveId: v.id("deepDives"),
    title: v.string(),
    type: v.union(v.literal("chat"), v.literal("vote"), v.literal("teamwork")),
    messages: v.array(v.any()),
    voteResults: v.optional(v.array(v.any())),
    teamworkMessages: v.optional(v.array(v.any())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_deepDiveId_updatedAt", ["deepDiveId", "updatedAt"]),

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
