import type { CreateDeepDiveInput } from "../../src/lib/deep-dive-types";
import { errorResponse, json, parseJson } from "../api-utils";
import { createDeepDive, getDeepDive, listDeepDives } from "../deep-dive-store";

export async function handleDeepDives(request: Request) {
  try {
    if (request.method === "GET") {
      return json(await listDeepDives());
    }

    if (request.method === "POST") {
      const body = await parseJson<CreateDeepDiveInput>(request);
      const deepDive = await createDeepDive(body);
      return json(deepDive, { status: 201 });
    }

    return errorResponse(new Error("Method not allowed"), 405);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDeepDive(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return errorResponse(new Error("Missing deep dive id"), 400);

    const deepDive = await getDeepDive(id);
    if (!deepDive) return errorResponse(new Error("Deep Dive not found"), 404);

    return json(deepDive);
  } catch (error) {
    return errorResponse(error);
  }
}
