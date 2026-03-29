import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import chatHandler from "../api/chat";
import debateHandler from "../api/debate";
import deepDiveHandler from "../api/deep-dive";
import deepDivesHandler from "../api/deep-dives";
import settingsHandler from "../api/settings";
import threadsHandler from "../api/threads";
import uploadsHandler from "../api/uploads";
import voteHandler from "../api/vote";

const handlers = new Map<string, { fetch(request: Request): Promise<Response> | Response }>([
  ["/api/chat", chatHandler],
  ["/api/debate", debateHandler],
  ["/api/deep-dive", deepDiveHandler],
  ["/api/deep-dives", deepDivesHandler],
  ["/api/settings", settingsHandler],
  ["/api/threads", threadsHandler],
  ["/api/uploads", uploadsHandler],
  ["/api/vote", voteHandler],
]);

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

export function devApiPlugin(): Plugin {
  return {
    name: "teselix-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        const url = new URL(req.url, "http://localhost:8080");
        const handler = handlers.get(url.pathname);
        if (!handler) {
          next();
          return;
        }

        try {
          const body = await readRequestBody(req);
          const request = new Request(url.toString(), {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body,
            duplex: "half",
          } as RequestInit);
          const response = await handler.fetch(request);
          await sendWebResponse(res, response);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
