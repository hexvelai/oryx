import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;
let initPromise: Promise<Client> | null = null;

function resolveDatabaseUrl() {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  const filePath = path.resolve(process.cwd(), "data", "mozaic.db");
  return `file:${filePath}`;
}

async function ensureLocalDataDir(url: string) {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length);
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function initSchema(db: Client) {
  await db.execute("PRAGMA foreign_keys = ON");

  const statements = [
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS deep_dives (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      providers TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      deep_dive_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (deep_dive_id) REFERENCES deep_dives(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      deep_dive_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (deep_dive_id) REFERENCES deep_dives(id) ON DELETE CASCADE
    )`,
  ];

  for (const statement of statements) {
    await db.execute(statement);
  }
}

export async function getDb() {
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const url = resolveDatabaseUrl();
    await ensureLocalDataDir(url);

    const db = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
    });

    await initSchema(db);
    client = db;
    return db;
  })();

  return initPromise;
}
