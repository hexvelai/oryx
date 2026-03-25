import { getDb } from "./db";

const OPENROUTER_KEY = "openrouter_api_key";

export type OpenRouterSettings = {
  configured: boolean;
  source: "frontend" | "environment" | "missing";
  lastFour: string | null;
};

function now() {
  return Date.now();
}

function envOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY?.trim() || "";
}

function lastFour(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.slice(-4) : null;
}

export async function getStoredOpenRouterKey() {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
    args: [OPENROUTER_KEY],
  });

  const value = result.rows[0]?.value;
  return typeof value === "string" ? value.trim() : "";
}

export async function setStoredOpenRouterKey(apiKey: string) {
  const value = apiKey.trim();
  const db = await getDb();

  await db.execute({
    sql: `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    args: [OPENROUTER_KEY, value, now()],
  });
}

export async function clearStoredOpenRouterKey() {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM app_settings WHERE key = ?",
    args: [OPENROUTER_KEY],
  });
}

export async function resolveOpenRouterKey() {
  const stored = await getStoredOpenRouterKey();
  return stored || envOpenRouterKey();
}

export async function getOpenRouterSettings(): Promise<OpenRouterSettings> {
  const stored = await getStoredOpenRouterKey();
  if (stored) {
    return {
      configured: true,
      source: "frontend",
      lastFour: lastFour(stored),
    };
  }

  const envKey = envOpenRouterKey();
  if (envKey) {
    return {
      configured: true,
      source: "environment",
      lastFour: lastFour(envKey),
    };
  }

  return {
    configured: false,
    source: "missing",
    lastFour: null,
  };
}
