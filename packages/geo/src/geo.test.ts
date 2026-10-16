import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { geoProcedures } from "./procedures.js";

const registry = new ProcedureRegistry();
for (const procedure of geoProcedures) registry.register(procedure);
const call = async <T>(path: string[], input: unknown): Promise<T> =>
  (await outputValue(await invokePath(path, input, { registry }), path)) as T;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geo.geocode", () => {
  it("sends the User-Agent of the caller and gives the first result", async () => {
    const fetchMock = vi.fn(async () => Response.json([{ lat: "10.5", lon: "-20.25", display_name: "Somewhere" }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await call(["geo", "geocode"], { query: "1 Test Road", userAgent: "my-app/1.0 (me@example.org)", countryCodes: "us" });
    expect(result).toEqual({ found: true, result: { lat: 10.5, lon: -20.25, displayName: "Somewhere" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("q=1+Test+Road");
    expect(url).toContain("countrycodes=us");
    expect((init.headers as Record<string, string>)["user-agent"]).toBe("my-app/1.0 (me@example.org)");
  });

  it("says found: false when there is no result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    expect(await call(["geo", "geocode"], { query: "nowhere", userAgent: "my-app/1.0" })).toEqual({ found: false });
  });

  it("requires a User-Agent", async () => {
    await expect(call(["geo", "geocode"], { query: "x" })).rejects.toThrow(/userAgent/);
  });

  it("stops at the time limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
      )
    );
    await expect(call(["geo", "geocode"], { query: "x", userAgent: "my-app/1.0", timeoutMs: 20 })).rejects.toThrow(/no answer in 20 ms/);
  });
});

describe("geo.route", () => {
  it("gives the kilometres and the minutes of the first route", async () => {
    const fetchMock = vi.fn(async () => Response.json({ code: "Ok", routes: [{ distance: 12_345, duration: 1_234 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await call(["geo", "route"], { from: { lat: 1, lon: 2 }, to: { lat: 3, lon: 4 } });
    expect(result).toEqual({ km: 12.3, minutes: 21 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/route/v1/driving/2,1;4,3?overview=false");
  });

  it("refuses a point off the map, and reports no route", async () => {
    await expect(call(["geo", "route"], { from: { lat: 91, lon: 0 }, to: { lat: 0, lon: 0 } })).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "NoRoute" })));
    await expect(call(["geo", "route"], { from: { lat: 0, lon: 0 }, to: { lat: 1, lon: 1 } })).rejects.toThrow(/no route \(NoRoute\)/);
  });
});
