import { errorResponse, json, parseJson } from "../api-utils";
import {
  clearStoredOpenRouterKey,
  getOpenRouterSettings,
  setStoredOpenRouterKey,
} from "../settings-store";

type SettingsBody = {
  openRouterApiKey?: string;
};

export async function handleSettings(request: Request) {
  try {
    if (request.method === "GET") {
      return json({ openRouter: await getOpenRouterSettings() });
    }

    if (request.method === "POST") {
      const body = await parseJson<SettingsBody>(request);
      const apiKey = body.openRouterApiKey?.trim() || "";
      if (!apiKey) return errorResponse(new Error("OpenRouter API key is required"), 400);

      await setStoredOpenRouterKey(apiKey);
      return json({ openRouter: await getOpenRouterSettings() });
    }

    if (request.method === "DELETE") {
      await clearStoredOpenRouterKey();
      return json({ openRouter: await getOpenRouterSettings() });
    }

    return errorResponse(new Error("Method not allowed"), 405);
  } catch (error) {
    return errorResponse(error);
  }
}
