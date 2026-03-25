import { queryGeneric, mutationGeneric, internalQueryGeneric } from "convex/server";
import { v } from "convex/values";

const OPENROUTER_KEY = "openrouter_api_key";
const query = queryGeneric;
const mutation = mutationGeneric;
const internalQuery = internalQueryGeneric;

function lastFour(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.slice(-4) : null;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const record = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", OPENROUTER_KEY))
      .unique();

    const value = record?.value?.trim() || "";
    return {
      openRouter: {
        configured: Boolean(value),
        source: value ? "frontend" : "missing",
        lastFour: lastFour(value),
      },
    };
  },
});

export const setOpenRouterKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.apiKey.trim();
    if (!trimmed) {
      throw new Error("OpenRouter API key is required");
    }

    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", OPENROUTER_KEY))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: trimmed,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("appSettings", {
        key: OPENROUTER_KEY,
        value: trimmed,
        updatedAt: Date.now(),
      });
    }
  },
});

export const clearOpenRouterKey = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", OPENROUTER_KEY))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getOpenRouterKey = internalQuery({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", OPENROUTER_KEY))
      .unique();

    return existing?.value?.trim() || "";
  },
});
