import type { CreateThreadInput } from "../../src/lib/deep-dive-types";
import { errorResponse, json, parseJson } from "../api-utils";
import { createThread } from "../deep-dive-store";

export async function handleThreads(request: Request) {
  try {
    if (request.method !== "POST") {
      return errorResponse(new Error("Method not allowed"), 405);
    }

    const body = await parseJson<CreateThreadInput>(request);
    if (!body.deepDiveId) return errorResponse(new Error("Missing deep dive id"), 400);

    const threadId = await createThread(body);
    return json({ threadId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
