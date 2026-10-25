import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { headerSafe, sendNotification } from "./notify.js";
import { notifyProcedures } from "./procedures.js";

const registry = new ProcedureRegistry();
for (const procedure of notifyProcedures) registry.register(procedure);
const send = async (input: unknown): Promise<unknown> =>
  outputValue(await invokePath(["notify", "send"], input, { registry }), ["notify", "send"]);

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["NTFY_TEST_TOKEN"];
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
    await expect(send({ topic: "t", title: "x", message: "y", tokenEnv: "NTFY_TEST_TOKEN" })).rejects.toThrow(/NTFY_TEST_TOKEN/);
    process.env["NTFY_TEST_TOKEN"] = "tk_madeup";
    await send({ topic: "t", title: "x", message: "y", tokenEnv: "NTFY_TEST_TOKEN", server: "https://ntfy.example.org" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://ntfy.example.org/t");
    expect(init.headers["authorization"]).toBe("Bearer tk_madeup");
  });

  // Audit pass 2 (O55): before, tokenEnv could name any variable, and the caller chose the server
  it("refuses a token variable without the prefix NTFY_ or NOTIFY_, and sends nothing", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const tokenEnv of ["GITHUB_TOKEN", "ANTHROPIC_API_KEY", "PATH", "ntfy_token", "NTFY_", "XNTFY_TOKEN"]) {
      await expect(send({ topic: "t", title: "x", message: "y", tokenEnv, server: "https://ntfy.example.org" }), tokenEnv).rejects.toThrow(
        /starts with NTFY_ or NOTIFY_/
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
    process.env["NOTIFY_AUDIT_TOKEN"] = "tk_madeup";
    try {
      await send({ topic: "t", title: "x", message: "y", tokenEnv: "NOTIFY_AUDIT_TOKEN" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env["NOTIFY_AUDIT_TOKEN"];
    }
  });

  it("throws when the server refuses, and refuses a topic with a slash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    await expect(send({ topic: "t", title: "x", message: "y" })).rejects.toThrow(/HTTP 429/);
    await expect(send({ topic: "a/b", title: "x", message: "y" })).rejects.toThrow();
  });
});

describe("sendNotification with the fetch option", () => {
  it("uses the fetch of the caller, and keeps its error as the cause", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("the global fetch was used"))));
    const bodies: string[] = [];
    await sendNotification(
      { topic: "t", title: "x", message: "y" },
      {
        timeoutMs: 1_000,
        fetch: async (_url, init) => {
          bodies.push(init.body);
          return { ok: true, status: 200 };
        },
      }
    );
    expect(bodies).toEqual(["y"]);

    const failure = new Error("fetch failed");
    const request = sendNotification({ topic: "t", title: "x", message: "y" }, { timeoutMs: 1_000, fetch: async () => Promise.reject(failure) });
    await expect(request).rejects.toThrow(/did not answer: the request failed/);
    await expect(request).rejects.toHaveProperty("cause", failure);
  });
});
