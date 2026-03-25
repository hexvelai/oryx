export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return json({ error: message }, { status });
}

export async function parseJson<T>(request: Request) {
  return (await request.json()) as T;
}
