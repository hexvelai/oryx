import { queryGeneric, mutationGeneric, internalQueryGeneric } from "convex/server";
import { v } from "convex/values";

const OPENROUTER_KEY = "openrouter_api_key";
const GEMINI_KEY = "gemini_api_key";
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
    const openRouterRecord = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", OPENROUTER_KEY))
      .unique();

    const geminiRecord = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", GEMINI_KEY))
      .unique();

    const openRouterValue = openRouterRecord?.value?.trim() || "";
    const geminiValue = geminiRecord?.value?.trim() || "";
    return {
      openRouter: {
        configured: Boolean(openRouterValue),
        source: openRouterValue ? "frontend" : "missing",
        lastFour: lastFour(openRouterValue),
      },
      gemini: {
        configured: Boolean(geminiValue),
        source: geminiValue ? "frontend" : "missing",
        lastFour: lastFour(geminiValue),
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

export const setGeminiKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.apiKey.trim();
    if (!trimmed) {
      throw new Error("Gemini API key is required");
    }

    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", GEMINI_KEY))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: trimmed,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("appSettings", {
        key: GEMINI_KEY,
        value: trimmed,
        updatedAt: Date.now(),
      });
    }
  },
});

export const clearGeminiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", GEMINI_KEY))
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

export const getGeminiKey = internalQuery({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", GEMINI_KEY))
      .unique();

    return existing?.value?.trim() || "";
  },
});
