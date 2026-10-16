import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { headerSafe } from "./notify.js";
import { notifyProcedures } from "./procedures.js";

const registry = new ProcedureRegistry();
for (const procedure of notifyProcedures) registry.register(procedure);
const send = async (input: unknown): Promise<unknown> =>
  outputValue(await invokePath(["notify", "send"], input, { registry }), ["notify", "send"]);

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["TEST_NTFY_TOKEN"];
});

describe("headerSafe", () => {
  it("changes characters above 255 and removes control characters", () => {
    expect(headerSafe("Done — 3 steps\r\n")).toBe("Done - 3 steps");
    expect(headerSafe("Café")).toBe("Café");
  });
});

describe("notify.send", () => {
  it("posts the message to the topic, with the title, the priority, the tags and the click address", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await send({ topic: "made-up-topic-1234", title: "Backup — done", message: "3 files", priority: "high", tags: ["check"], click: "https://example.org/x" })
    ).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://ntfy.sh/made-up-topic-1234");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("3 files");
    expect(init.headers).toEqual({ title: "Backup - done", priority: "high", tags: "check", click: "https://example.org/x" });
  });

  it("sends the token of a protected topic from the environment", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(send({ topic: "t", title: "x", message: "y", tokenEnv: "TEST_NTFY_TOKEN" })).rejects.toThrow(/TEST_NTFY_TOKEN/);
    process.env["TEST_NTFY_TOKEN"] = "tk_madeup";
    await send({ topic: "t", title: "x", message: "y", tokenEnv: "TEST_NTFY_TOKEN", server: "https://ntfy.example.org" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://ntfy.example.org/t");
    expect(init.headers["authorization"]).toBe("Bearer tk_madeup");
  });

  it("throws when the server refuses, and refuses a topic with a slash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    await expect(send({ topic: "t", title: "x", message: "y" })).rejects.toThrow(/HTTP 429/);
    await expect(send({ topic: "a/b", title: "x", message: "y" })).rejects.toThrow();
  });
});
