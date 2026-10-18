/**
 * The fetch options of `HttpTransport` (CLI-18): the credentials mode for a cookie session on
 * another origin, the other options of `fetch`, and a `fetch` function of the caller.
 */

import { describe, it, expect } from "vitest";
import { HttpTransport } from "./transport.js";
import { pathToMethod } from "../../../server/method.js";
import type { Message } from "../../../client/types.js";

/** A fetch double: it keeps the options of each call and answers with JSON. */
function recordingFetch(): { fetch: typeof fetch; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: fake, calls };
}

const message: Message = { id: "m1", method: pathToMethod(["a", "b"]), payload: {}, metadata: {} };

async function send(transport: HttpTransport): Promise<void> {
  for await (const item of transport.send(message)) expect(item.status.type).toBe("success");
}

describe("HttpTransport: the options of fetch (CLI-18)", () => {
  it("sends the credentials mode, and keeps the method, the headers, the body and the signal", async () => {
    const { fetch, calls } = recordingFetch();
    await send(new HttpTransport({ baseUrl: "https://api.example/api", credentials: "include", fetch }));
    expect(calls[0]).toMatchObject({ credentials: "include", method: "POST", body: "{}" });
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect((calls[0]?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends the other options of requestInit, and the credentials option goes over them", async () => {
    const { fetch, calls } = recordingFetch();
    await send(new HttpTransport({ baseUrl: "https://api.example/api", requestInit: { mode: "cors", redirect: "error", credentials: "omit" }, credentials: "include", fetch }));
    expect(calls[0]).toMatchObject({ mode: "cors", redirect: "error", credentials: "include" });
  });

  it("sends no credentials mode by default, so fetch keeps its own default", async () => {
    const { fetch, calls } = recordingFetch();
    await send(new HttpTransport({ baseUrl: "https://api.example/api", fetch }));
    expect(calls[0] && "credentials" in calls[0]).toBe(false);
  });
});
