import type { AIProvider } from "@/types/ai";
import type { CreateDeepDiveInput, DeepDiveRecord, DeepDiveUIMessage, SharedUploadRecord } from "@/lib/deep-dive-types";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchDeepDives() {
  const response = await fetch("/api/deep-dives");
  return readJson<DeepDiveRecord[]>(response);
}

export async function fetchDeepDive(id: string) {
  const response = await fetch(`/api/deep-dive?id=${encodeURIComponent(id)}`);
  return readJson<DeepDiveRecord>(response);
}

export async function createDeepDive(input: CreateDeepDiveInput) {
  const response = await fetch("/api/deep-dives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<DeepDiveRecord>(response);
}

export async function createThread(input: {
  deepDiveId: string;
  title?: string;
  type?: "chat" | "vote" | "teamwork";
  seedMessages?: DeepDiveUIMessage[];
}) {
  const response = await fetch("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<{ threadId: string }>(response);
}

export async function runVote(input: { deepDiveId: string; threadId: string; prompt: string }) {
  const response = await fetch("/api/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<{ ok?: boolean }>(response);
}

export async function runDebate(input: { deepDiveId: string; threadId: string; prompt: string; participants: AIProvider[] }) {
  const response = await fetch("/api/debate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<{ ok?: boolean }>(response);
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function addUploads(deepDiveId: string, files: File[]) {
  const payload: Array<Pick<SharedUploadRecord, "name" | "type" | "url">> = await Promise.all(
    files.map(async file => ({
      name: file.name,
      type: file.type || "application/octet-stream",
      url: await fileToDataUrl(file),
    })),
  );

  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deepDiveId, files: payload }),
  });
  return readJson<{ ok: true }>(response);
}

export async function removeUpload(deepDiveId: string, uploadId: string) {
  const response = await fetch(`/api/uploads?deepDiveId=${encodeURIComponent(deepDiveId)}&uploadId=${encodeURIComponent(uploadId)}`, {
    method: "DELETE",
  });
  return readJson<{ ok: true }>(response);
}
