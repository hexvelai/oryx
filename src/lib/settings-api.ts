export type AppSettings = {
  openRouter: {
    configured: boolean;
    source: "frontend" | "environment" | "missing";
    lastFour: string | null;
  };
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchAppSettings() {
  const response = await fetch("/api/settings");
  return readJson<AppSettings>(response);
}

export async function saveOpenRouterKey(openRouterApiKey: string) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openRouterApiKey }),
  });
  return readJson<AppSettings>(response);
}

export async function clearOpenRouterKey() {
  const response = await fetch("/api/settings", {
    method: "DELETE",
  });
  return readJson<AppSettings>(response);
}
