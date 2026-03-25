import { validateUIMessages } from "ai";
import type { AIProvider } from "../../src/types/ai";
import type { DeepDiveMessageMetadata, DeepDiveUIMessage } from "../../src/lib/deep-dive-types";
import { DEEP_DIVE_PROVIDERS } from "../../src/lib/deep-dive-types";
import { errorResponse, parseJson } from "../api-utils";
import { createThreadStream, parseExplicitProvider, pickBestProvider, providerDisplayName, stripProviderMention } from "../ai";
import { listDeepDives, saveThreadMessages } from "../deep-dive-store";

type ChatRequestBody = {
  id?: string;
  threadId?: string;
  messages?: DeepDiveUIMessage[];
};

function hasRenderableParts(message: DeepDiveUIMessage) {
  return message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return Boolean(part.text?.trim());
    }
    return true;
  });
}

export async function handleChat(request: Request) {
  try {
    if (request.method !== "POST") {
      return errorResponse(new Error("Method not allowed"), 405);
    }

    const body = await parseJson<ChatRequestBody>(request);
    const threadId = body.threadId ?? body.id;
    const messages = (body.messages ?? []).filter(hasRenderableParts);
    if (!threadId) return errorResponse(new Error("Missing thread id"), 400);

    const validatedMessages = await validateUIMessages<DeepDiveMessageMetadata>({
      messages,
    });

    const latestUserMessage = [...validatedMessages].reverse().find(message => message.role === "user");
    const latestText = latestUserMessage?.parts.find(part => part.type === "text")?.text ?? "";
    const cleaned = stripProviderMention(latestText);
    if (!cleaned.trim()) return errorResponse(new Error("Cannot send an empty message"), 400);

    const allDives = await getDeepDiveForThread(threadId);
    const allowedProviders = allDives?.providers.length ? allDives.providers : [...DEEP_DIVE_PROVIDERS];

    const explicit = parseExplicitProvider(latestText);
    const chosenHistory = validatedMessages.slice(0, -1);
    const picked = pickBestProvider({
      prompt: cleaned,
      history: chosenHistory,
      allowed: allowedProviders,
    });

    const chosenProvider: AIProvider = explicit && allowedProviders.includes(explicit) ? explicit : picked.provider;
    const routingNote =
      explicit && allowedProviders.includes(explicit)
        ? undefined
        : `Answered by ${providerDisplayName(chosenProvider)} for ${picked.reason}.`;

    const sanitizedMessages = latestUserMessage
      ? validatedMessages.map(message =>
          message.id === latestUserMessage.id
            ? {
                ...message,
                parts: message.parts.map(part =>
                  part.type === "text" ? { ...part, text: cleaned } : part,
                ),
              }
            : message,
        )
      : validatedMessages;

    return createThreadStream({
      messages: sanitizedMessages,
      provider: chosenProvider,
      routingNote,
      onFinish: async (finalMessages) => {
        await saveThreadMessages(threadId, finalMessages.filter(hasRenderableParts));
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function getDeepDiveForThread(threadId: string) {
  const dives = await listDeepDives();
  return dives.find(dive => dive.threads.some(thread => thread.id === threadId)) ?? null;
}
