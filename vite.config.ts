import { createDecartClient, type CreateTokenOptions } from "@decartai/sdk";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

export function localTokenEndpoint(
  apiKey: string | undefined,
  mintToken: (key: string, options: CreateTokenOptions) => Promise<{ apiKey: string }> = (key, options) =>
    createDecartClient({ apiKey: key, telemetry: false }).tokens.create(options),
): Plugin {
  const recentRequests = new Map<string, number[]>();
  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/api/realtime-token") return false;
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return true;
    }
    if ((request.headers["content-length"] && request.headers["content-length"] !== "0") || request.headers["transfer-encoding"]) {
      response.writeHead(413).end();
      return true;
    }
    const origin = request.headers.origin;
    const host = request.headers.host;
    const site = request.headers["sec-fetch-site"];
    const expectedHeader = request.headers["x-fitcheck-request"];
    let originUrl: URL | undefined;
    try { if (origin) originUrl = new URL(origin); } catch { /* reject below */ }
    if (
      typeof origin !== "string" || !originUrl || originUrl.host !== host ||
      !["localhost", "127.0.0.1", "[::1]"].includes(originUrl.hostname) ||
      !["http:", "https:"].includes(originUrl.protocol) ||
      (site && site !== "same-origin" && site !== "none") || expectedHeader !== "1"
    ) {
      response.writeHead(403).end();
      return true;
    }
    if (!apiKey) {
      response.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "DECART_API_KEY is not configured on the local server." }));
      return true;
    }
    const address = request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const recent = (recentRequests.get(address) ?? []).filter((time) => now - time < 60_000);
    if (recent.length >= 20) {
      response.writeHead(429).end();
      return true;
    }
    recent.push(now);
    recentRequests.set(address, recent);
    try {
      const token = await mintToken(apiKey, {
        expiresIn: 60,
        allowedModels: ["lucy-2.6"],
        allowedOrigins: [origin],
        constraints: { realtime: { maxSessionDuration: 600 } },
      });
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(token));
    } catch {
      response.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Decart could not issue a session token." }));
    }
    return true;
  };
  const useMiddleware = (middlewares: Connect.Server) => {
    middlewares.use((request, response, next) => {
      void handler(request, response).then((handled) => { if (!handled) next(); }).catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
      });
    });
  };
  return {
    name: "fitcheck-local-decart-token",
    configureServer(server) { useMiddleware(server.middlewares); },
    configurePreviewServer(server) { useMiddleware(server.middlewares); },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), localTokenEndpoint(env.DECART_API_KEY)],
    build: { chunkSizeWarningLimit: 700 },
    test: { include: ["src/**/*.test.ts"] },
  };
});
