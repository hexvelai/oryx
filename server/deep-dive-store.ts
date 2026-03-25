import { generateId } from "ai";
import type { AIProvider } from "../src/types/ai";
import type {
  CreateDeepDiveInput,
  CreateThreadInput,
  DeepDiveRecord,
  DeepDiveThreadRecord,
  DeepDiveUIMessage,
  SharedUploadRecord,
  TeamworkMessage,
  VoteResult,
} from "../src/lib/deep-dive-types";
import { DEEP_DIVE_PROVIDERS } from "../src/lib/deep-dive-types";
import { getDb } from "./db";

type ThreadState = {
  voteResults?: VoteResult[];
  teamworkMessages?: TeamworkMessage[];
};

function now() {
  return Date.now();
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeProviders(providers?: AIProvider[]) {
  const next = (providers?.filter(Boolean) ?? []).filter((provider, index, items) => items.indexOf(provider) === index);
  return next.length ? next : [...DEEP_DIVE_PROVIDERS];
}

function rowToThread(row: Record<string, unknown>): DeepDiveThreadRecord {
  const state = safeParseJson<ThreadState>(String(row.state ?? ""), {});
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    type: String(row.type) as DeepDiveThreadRecord["type"],
    messages: safeParseJson<DeepDiveUIMessage[]>(String(row.messages ?? "[]"), []),
    voteResults: state.voteResults,
    teamworkMessages: state.teamworkMessages,
  };
}

function rowToUpload(row: Record<string, unknown>): SharedUploadRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    url: String(row.url),
    createdAt: Number(row.created_at),
  };
}

async function maybeSeedDatabase() {
  const db = await getDb();
  const existing = await db.execute("SELECT id FROM deep_dives LIMIT 1");
  if (existing.rows.length > 0) return;

  const seeded = [
    {
      id: generateId(),
      title: "Pricing page rewrite",
      providers: ["claude", "gpt"] as AIProvider[],
      thread: {
        id: generateId(),
        title: "Messaging + positioning",
        type: "chat" as const,
        messages: [
          {
            id: generateId(),
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Rewrite the pricing page in a more editorial tone." }],
          },
          {
            id: generateId(),
            role: "assistant" as const,
            metadata: { provider: "gpt", createdAt: now() - 1000 * 60 * 60 * 20, routingNote: "Answered by GPT for clear writing structure." },
            parts: [{ type: "text" as const, text: "Here's a tighter rewrite with stronger hierarchy and a more confident tone." }],
          },
        ],
      },
    },
    {
      id: generateId(),
      title: "Onboarding flow",
      providers: ["gemini", "gpt", "claude"] as AIProvider[],
      thread: {
        id: generateId(),
        title: "Step-by-step UX",
        type: "chat" as const,
        messages: [
          {
            id: generateId(),
            role: "user" as const,
            parts: [{ type: "text" as const, text: "Propose a lightweight three-step onboarding." }],
          },
          {
            id: generateId(),
            role: "assistant" as const,
            metadata: { provider: "claude", createdAt: now() - 1000 * 60 * 60 * 6, routingNote: "Answered by Claude for synthesis and flow." },
            parts: [{ type: "text" as const, text: "Lead with value first, then ask for the minimum information needed to personalize the experience." }],
          },
        ],
      },
    },
  ];

  const createdAt = now() - 1000 * 60 * 60 * 24;
  for (const item of seeded) {
    const updatedAt = createdAt + Math.floor(Math.random() * 1000 * 60 * 60 * 12);
    await db.execute({
      sql: "INSERT INTO deep_dives (id, title, providers, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [item.id, item.title, JSON.stringify(item.providers), createdAt, updatedAt],
    });
    await db.execute({
      sql: "INSERT INTO threads (id, deep_dive_id, title, type, messages, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        item.thread.id,
        item.id,
        item.thread.title,
        item.thread.type,
        JSON.stringify(item.thread.messages),
        JSON.stringify({}),
        createdAt,
        updatedAt,
      ],
    });
  }
}

export async function listDeepDives(): Promise<DeepDiveRecord[]> {
  await maybeSeedDatabase();
  const db = await getDb();

  const dives = await db.execute("SELECT * FROM deep_dives ORDER BY updated_at DESC");
  const threads = await db.execute("SELECT * FROM threads ORDER BY updated_at DESC");
  const uploads = await db.execute("SELECT * FROM uploads ORDER BY created_at DESC");

  const threadsByDive = new Map<string, DeepDiveThreadRecord[]>();
  for (const row of threads.rows as Array<Record<string, unknown>>) {
    const thread = rowToThread(row);
    const deepDiveId = String(row.deep_dive_id);
    const next = threadsByDive.get(deepDiveId) ?? [];
    next.push(thread);
    threadsByDive.set(deepDiveId, next);
  }

  const uploadsByDive = new Map<string, SharedUploadRecord[]>();
  for (const row of uploads.rows as Array<Record<string, unknown>>) {
    const upload = rowToUpload(row);
    const deepDiveId = String(row.deep_dive_id);
    const next = uploadsByDive.get(deepDiveId) ?? [];
    next.push(upload);
    uploadsByDive.set(deepDiveId, next);
  }

  return (dives.rows as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: String(row.title),
    providers: safeParseJson<AIProvider[]>(String(row.providers), [...DEEP_DIVE_PROVIDERS]),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    threads: threadsByDive.get(String(row.id)) ?? [],
    uploads: uploadsByDive.get(String(row.id)) ?? [],
  }));
}

export async function getDeepDive(id: string): Promise<DeepDiveRecord | null> {
  const dives = await listDeepDives();
  return dives.find(dive => dive.id === id) ?? null;
}

export async function createDeepDive(input: CreateDeepDiveInput = {}) {
  const db = await getDb();
  const timestamp = now();
  const deepDiveId = generateId();
  const threadId = generateId();
  const providers = normalizeProviders(input.providers);

  await db.execute({
    sql: "INSERT INTO deep_dives (id, title, providers, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [deepDiveId, input.title?.trim() || "New Deep Dive", JSON.stringify(providers), timestamp, timestamp],
  });

  await db.execute({
    sql: "INSERT INTO threads (id, deep_dive_id, title, type, messages, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [threadId, deepDiveId, "Thread 1", "chat", JSON.stringify([]), JSON.stringify({}), timestamp, timestamp],
  });

  return getDeepDive(deepDiveId);
}

export async function createThread(input: CreateThreadInput) {
  const db = await getDb();
  const timestamp = now();
  const threadId = generateId();

  await db.execute({
    sql: "INSERT INTO threads (id, deep_dive_id, title, type, messages, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      threadId,
      input.deepDiveId,
      input.title?.trim() || "New thread",
      input.type ?? "chat",
      JSON.stringify(input.seedMessages ?? []),
      JSON.stringify({}),
      timestamp,
      timestamp,
    ],
  });

  await db.execute({
    sql: "UPDATE deep_dives SET updated_at = ? WHERE id = ?",
    args: [timestamp, input.deepDiveId],
  });

  return threadId;
}

export async function saveThreadMessages(threadId: string, messages: DeepDiveUIMessage[]) {
  const db = await getDb();
  const timestamp = now();

  const threadResult = await db.execute({
    sql: "SELECT deep_dive_id FROM threads WHERE id = ? LIMIT 1",
    args: [threadId],
  });

  const deepDiveId = threadResult.rows[0]?.deep_dive_id;
  if (!deepDiveId) return;

  const titleCandidate = messages.find(m => m.role === "user")?.parts.find(part => part.type === "text" && part.text.trim())?.text.trim();
  const title = titleCandidate ? truncateTitle(titleCandidate) : undefined;

  await db.execute({
    sql: "UPDATE threads SET messages = ?, updated_at = ?, title = COALESCE(NULLIF(title, 'New thread'), ?) WHERE id = ?",
    args: [JSON.stringify(messages), timestamp, title ?? null, threadId],
  });
  await db.execute({
    sql: "UPDATE deep_dives SET updated_at = ? WHERE id = ?",
    args: [timestamp, deepDiveId],
  });
}

function truncateTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ");
  return normalized.length > 56 ? `${normalized.slice(0, 55)}...` : normalized;
}

export async function saveThreadState(threadId: string, state: ThreadState) {
  const db = await getDb();
  const timestamp = now();

  const threadResult = await db.execute({
    sql: "SELECT deep_dive_id FROM threads WHERE id = ? LIMIT 1",
    args: [threadId],
  });
  const deepDiveId = threadResult.rows[0]?.deep_dive_id;
  if (!deepDiveId) return;

  await db.execute({
    sql: "UPDATE threads SET state = ?, updated_at = ? WHERE id = ?",
    args: [JSON.stringify(state), timestamp, threadId],
  });
  await db.execute({
    sql: "UPDATE deep_dives SET updated_at = ? WHERE id = ?",
    args: [timestamp, deepDiveId],
  });
}

export async function addUploads(deepDiveId: string, files: Array<{ name: string; type: string; url: string }>) {
  const db = await getDb();
  const timestamp = now();

  for (const file of files) {
    await db.execute({
      sql: "INSERT INTO uploads (id, deep_dive_id, name, type, url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [generateId(), deepDiveId, file.name, file.type || "application/octet-stream", file.url, timestamp],
    });
  }

  await db.execute({
    sql: "UPDATE deep_dives SET updated_at = ? WHERE id = ?",
    args: [timestamp, deepDiveId],
  });
}

export async function removeUpload(deepDiveId: string, uploadId: string) {
  const db = await getDb();
  const timestamp = now();

  await db.execute({
    sql: "DELETE FROM uploads WHERE id = ? AND deep_dive_id = ?",
    args: [uploadId, deepDiveId],
  });

  await db.execute({
    sql: "UPDATE deep_dives SET updated_at = ? WHERE id = ?",
    args: [timestamp, deepDiveId],
  });
}
