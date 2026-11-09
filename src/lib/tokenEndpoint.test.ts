import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { CreateTokenOptions } from "@decartai/sdk";
import { localTokenEndpoint } from "../../vite.config";

function createEndpoint(apiKey: string | undefined = "server-secret") {
  const mintToken = vi.fn(async (_key: string, _options: CreateTokenOptions) => ({ apiKey: "short-lived-token" }));
  const plugin = localTokenEndpoint(apiKey, mintToken);
  let middleware: (request: IncomingMessage, response: ServerResponse, next: () => void) => void = () => {};
  const configure = typeof plugin.configureServer === "function" ? plugin.configureServer : plugin.configureServer?.handler;
  configure?.call({} as never, {
    middlewares: { use: (handler: typeof middleware) => { middleware = handler; } },
  } as never);

  async function request(overrides: {
    method?: string;
    headers?: Record<string, string>;
    remoteAddress?: string;
  } = {}) {
    let status = 0;
    const headers: Record<string, string> = {};
    let body = "";
    let finish!: () => void;
    const ended = new Promise<void>((resolve) => { finish = resolve; });
    const response = {
      setHeader: (name: string, value: string) => { headers[name] = value; },
      writeHead: (value: number) => { status = value; return response; },
      end: (value?: string) => { body = value ?? ""; finish(); return response; },
    } as unknown as ServerResponse;
    const message = {
      url: "/api/realtime-token",
      method: overrides.method ?? "POST",
      headers: {
        origin: "http://127.0.0.1:4173",
        host: "127.0.0.1:4173",
        "sec-fetch-site": "same-origin",
        "x-fitcheck-request": "1",
        ...overrides.headers,
      },
      socket: { remoteAddress: overrides.remoteAddress ?? "127.0.0.1" },
    } as unknown as IncomingMessage;
    middleware(message, response, () => {});
    await ended;
    return { status, headers, body };
  }

  return { request, mintToken };
}

describe("local realtime token endpoint", () => {
  it("requires same-origin requests with the FitCheck header", async () => {
    const { request, mintToken } = createEndpoint();
    const response = await request({ headers: { origin: "http://attacker.test" } });
    expect(response.status).toBe(403);
    expect((await request({ headers: { host: "localhost:5173" } })).status).toBe(403);
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("rejects requests from network peers even when their origin claims localhost", async () => {
    const { request, mintToken } = createEndpoint();
    const response = await request({
      headers: { origin: "http://localhost:4173", host: "localhost:4173" },
      remoteAddress: "192.168.1.25",
    });
    expect(response.status).toBe(403);
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("rejects requests with a body", async () => {
    expect((await createEndpoint().request({ headers: { "content-length": "4" } })).status).toBe(413);
    expect((await createEndpoint().request({ headers: { "transfer-encoding": "chunked" } })).status).toBe(413);
  });

  it("mints a short-lived token scoped to the requesting origin and model", async () => {
    const { request, mintToken } = createEndpoint();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toEqual({ apiKey: "short-lived-token" });
    expect(mintToken).toHaveBeenCalledWith("server-secret", {
      expiresIn: 60,
      allowedModels: ["lucy-2.6"],
      allowedOrigins: ["http://127.0.0.1:4173"],
      constraints: { realtime: { maxSessionDuration: 600 } },
    });
  });

  it("rejects non-POST requests and missing server credentials", async () => {
    expect((await createEndpoint().request({ method: "GET" })).status).toBe(405);
    expect((await createEndpoint("").request()).status).toBe(503);
  });

  it("limits token issuance to 20 requests per minute per client", async () => {
    const { request } = createEndpoint();
    for (let index = 0; index < 20; index++) expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
  });
});
