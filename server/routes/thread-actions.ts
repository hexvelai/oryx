import type { AIProvider } from "../../src/types/ai";
import { DEEP_DIVE_PROVIDERS } from "../../src/lib/deep-dive-types";
import { errorResponse, json, parseJson } from "../api-utils";
import { runDebate, runVote } from "../ai";
import { getDeepDive, saveThreadState } from "../deep-dive-store";

type ActionBody = {
  deepDiveId: string;
  threadId: string;
  prompt: string;
  participants?: AIProvider[];
};

export async function handleVote(request: Request) {
  try {
    if (request.method !== "POST") return errorResponse(new Error("Method not allowed"), 405);
    const body = await parseJson<ActionBody>(request);
    const deepDive = await getDeepDive(body.deepDiveId);
    if (!deepDive) return errorResponse(new Error("Deep Dive not found"), 404);

    const participants = deepDive.providers.length ? deepDive.providers : [...DEEP_DIVE_PROVIDERS];
    const voteResults = await runVote(body.prompt, participants);
    await saveThreadState(body.threadId, { voteResults });
    return json({ voteResults });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDebate(request: Request) {
  try {
    if (request.method !== "POST") return errorResponse(new Error("Method not allowed"), 405);
    const body = await parseJson<ActionBody>(request);
    const participants = body.participants?.length ? body.participants : [...DEEP_DIVE_PROVIDERS];
    const teamworkMessages = await runDebate(body.prompt, participants);
    await saveThreadState(body.threadId, { teamworkMessages });
    return json({ teamworkMessages });
  } catch (error) {
    return errorResponse(error);
  }
}
