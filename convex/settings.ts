import { queryGeneric, mutationGeneric, internalQueryGeneric } from "convex/server";
import { v } from "convex/values";

const OPENROUTER_KEY = "openrouter_api_key";
const GEMINI_KEY = "gemini_api_key";
const DEEPSEEK_KEY = "deepseek_api_key";
const API_KEYS_V1 = "api_keys_v1";
const query = queryGeneric;
const mutation = mutationGeneric;
const internalQuery = internalQueryGeneric;

function lastFour(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.slice(-4) : null;
}

function readStoredKeyArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getStoredKeyId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id ? id : null;
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

    const deepSeekRecord = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", DEEPSEEK_KEY))
      .unique();

    const openRouterValue = openRouterRecord?.value?.trim() || "";
    const geminiValue = geminiRecord?.value?.trim() || "";
    const deepSeekValue = deepSeekRecord?.value?.trim() || "";

    const apiKeysRecord = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", API_KEYS_V1))
      .unique();
    const apiKeysRaw = apiKeysRecord?.value ?? "[]";
    const apiKeys = (() => {
      try {
        const parsed = JSON.parse(apiKeysRaw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter((x) => x && typeof x === "object")
          .map((x) => x as Record<string, unknown>)
          .map((x) => ({
            id: typeof x.id === "string" ? x.id : "",
            provider: typeof x.provider === "string" ? x.provider : "openrouter",
            name: typeof x.name === "string" ? x.name : "Key",
            lastFour: typeof x.lastFour === "string" ? x.lastFour : null,
            createdAt: typeof x.createdAt === "number" ? x.createdAt : Date.now(),
          }))
          .filter((x) => Boolean(x.id));
      } catch {
        return [];
      }
    })();

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
      deepseek: {
        configured: Boolean(deepSeekValue),
        source: deepSeekValue ? "frontend" : "missing",
        lastFour: lastFour(deepSeekValue),
      },
      apiKeys,
    };
  },
});

export const addApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openrouter"),
      v.literal("gemini"),
      v.literal("openai"),
      v.literal("claude"),
      v.literal("deepseek"),
    ),
    name: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const provider = args.provider;
    const name = args.name.replace(/\s+/g, " ").trim() || "Key";
    const apiKey = args.apiKey.trim();
    if (!apiKey) throw new Error("API key is required");

    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", API_KEYS_V1))
      .unique();

    const now = Date.now();
    const current = readStoredKeyArray(existing?.value ?? "[]");

    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${now}-${Math.random().toString(16).slice(2)}`;
    const entry = {
      id,
      provider,
      name,
      apiKey,
      lastFour: lastFour(apiKey),
      createdAt: now,
    };

    const next = JSON.stringify([entry, ...current].slice(0, 25));
    if (existing) {
      await ctx.db.patch(existing._id, { value: next, updatedAt: now });
    } else {
      await ctx.db.insert("appSettings", { key: API_KEYS_V1, value: next, updatedAt: now });
    }

    // Keep legacy single-key fields in sync for existing backend code paths.
    if (provider === "openrouter") {
      const old = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", OPENROUTER_KEY)).unique();
      if (old) await ctx.db.patch(old._id, { value: apiKey, updatedAt: now });
      else await ctx.db.insert("appSettings", { key: OPENROUTER_KEY, value: apiKey, updatedAt: now });
    }
    if (provider === "gemini") {
      const old = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", GEMINI_KEY)).unique();
      if (old) await ctx.db.patch(old._id, { value: apiKey, updatedAt: now });
      else await ctx.db.insert("appSettings", { key: GEMINI_KEY, value: apiKey, updatedAt: now });
    }
    if (provider === "deepseek") {
      const old = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", DEEPSEEK_KEY)).unique();
      if (old) await ctx.db.patch(old._id, { value: apiKey, updatedAt: now });
      else await ctx.db.insert("appSettings", { key: DEEPSEEK_KEY, value: apiKey, updatedAt: now });
    }
  },
});

export const deleteApiKey = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = args.id.trim();
    if (!id) return;
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", API_KEYS_V1))
      .unique();
    if (!existing) return;
    const now = Date.now();
    const current = readStoredKeyArray(existing.value ?? "[]");
    const next = current.filter((x) => getStoredKeyId(x) !== id);
    await ctx.db.patch(existing._id, { value: JSON.stringify(next), updatedAt: now });
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

export const getDeepSeekKey = internalQuery({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", DEEPSEEK_KEY))
      .unique();

    return existing?.value?.trim() || "";
  },
});
