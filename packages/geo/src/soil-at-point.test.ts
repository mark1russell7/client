/**
 * The procedure geo.soilAtPoint: one POST that only reads, to Soil Data Access, at the pace of its host.
 */
import { InvocationError, createRegistry, invokePath, outputValue } from "@procedures/client";
import type { Pace } from "polite-crawler/api";
import { HostScheduler } from "polite-crawler/politeness";
import { describe, expect, it, vi } from "vitest";
import { createGeoModule } from "./module.js";
import { fetchLikeOf, type GeoFetch } from "./polite.js";
import { geoSoilAtPoint } from "./procedures/geo/soilAtPoint.js";
import { SOIL_DATA_ACCESS_HOST, SOIL_DATA_ACCESS_URL, SSURGO_ATTRIBUTION } from "./soil.js";

const userAgent = "test-app/1.0 (test@example.org)";
const columns = ["mukey", "muname", "compname", "comppct_r", "interphrc", "interphr", "slope_l", "slope_r", "slope_h", "drainagecl", "hydricrating"];
const answer = { Table: [columns, ["1", "Made-up loam, 0 to 3 percent slopes", "Made-up", "80", "Somewhat limited", "0.5", "0", "2", "3", "Well drained", "No"]] };

/** A pace on a test clock: each rest moves the clock, and no test waits. */
function testPace(): Pace {
  let time = 1_000_000;
  const clock = { now: () => time, sleep: async (ms: number) => void (time += ms) };
  return { scheduler: new HostScheduler(clock, 4), now: clock.now };
}

/** A fetch that records each request, and gives one answer. */
function recordingFetch(body: unknown, status = 200) {
  const requests: { url: string; method: string | undefined; body: string | undefined; headers: Record<string, string> }[] = [];
  const fetch: GeoFetch = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, headers: init.headers });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status === 200, status, headers: { "content-type": "application/json" }, text: async () => text, json: async () => JSON.parse(text) as unknown };
  };
  return { fetch, requests };
}

describe("geo.soilAtPoint", () => {
  it("sends one POST with the query in its body to Soil Data Access, and gives the components", async () => {
    const { fetch, requests } = recordingFetch(answer);
    const output = await geoSoilAtPoint({ lat: 44.9, lon: -69.2, userAgent }, { fetch, pace: testPace() });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: SOIL_DATA_ACCESS_URL, method: "POST" });
    expect(new URL(SOIL_DATA_ACCESS_URL).hostname).toBe(SOIL_DATA_ACCESS_HOST);
    expect(requests[0]?.headers).toMatchObject({ "content-type": "application/json", "user-agent": userAgent });
    expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({ format: "JSON+COLUMNNAME" });
    expect(JSON.parse(requests[0]?.body ?? "{}").query).toContain("point(-69.200000 44.900000)");
    expect(output).toEqual({
      components: [
        {
          mukey: "1",
          mapUnit: "Made-up loam, 0 to 3 percent slopes",
          component: "Made-up",
          percent: 80,
          septic: "Somewhat limited",
          septicValue: 0.5,
          slope: { low: 0, representative: 2, high: 3 },
          drainage: "Well drained",
          hydric: "No",
        },
      ],
      attribution: SSURGO_ATTRIBUTION,
    });
  });

  it("gives no component for a point with no map unit, and fails for a status other than 200", async () => {
    expect((await geoSoilAtPoint({ lat: 0, lon: 0, userAgent }, { fetch: recordingFetch({}).fetch, pace: testPace() })).components).toEqual([]);
    await expect(geoSoilAtPoint({ lat: 0, lon: 0, userAgent }, { fetch: recordingFetch("Invalid query", 400).fetch, pace: testPace() })).rejects.toThrow(/Soil Data Access gave 400/);
  });

  it("is a procedure of the module that reads the network, and keeps the refusal of the host policy", async () => {
    const { fetch } = recordingFetch(answer);
    const registry = createRegistry(createGeoModule({ fetch, pace: testPace() }));
    const path = ["geo", "soilAtPoint"];
    expect(registry.get(path)?.metadata.effects).toEqual({ reads: ["network"], writes: [] });
    const output = (await outputValue(await invokePath(path, { lat: 44.9, lon: -69.2, userAgent }, { registry }), path)) as { components: unknown[] };
    expect(output.components).toHaveLength(1);
    const refusal = new InvocationError("FORBIDDEN", "the host sdmdataaccess.sc.egov.usda.gov:443 takes no POST", ["http", "request"], "host-not-allowed");
    const refused = createRegistry(createGeoModule({ fetch: vi.fn<GeoFetch>(async () => Promise.reject(refusal)), pace: testPace() }));
    await expect(invokePath(path, { lat: 44.9, lon: -69.2, userAgent }, { registry: refused }).then((result) => outputValue(result, path))).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "host-not-allowed",
    });
  });

  it("refuses a point that is not on the map before a request", async () => {
    const fetch = vi.fn<GeoFetch>();
    const registry = createRegistry(createGeoModule({ fetch, pace: testPace() }));
    const path = ["geo", "soilAtPoint"];
    await expect(invokePath(path, { lat: 91, lon: 0, userAgent }, { registry }).then((result) => outputValue(result, path))).rejects.toThrow(/lat/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("a POST of the transport", () => {
  const signal = new AbortController().signal;

  it("sends a POST with its body only when the caller tells that it only reads", async () => {
    const { fetch, requests } = recordingFetch({});
    await expect(fetchLikeOf(fetch)("https://example.org/", { method: "POST", headers: {}, body: "{}", redirect: "manual", signal })).rejects.toThrow(/only GET/);
    await expect(fetchLikeOf(fetch, true)("https://example.org/", { method: "PUT", headers: {}, body: "{}", redirect: "manual", signal })).rejects.toThrow(/not PUT/);
    expect(requests).toEqual([]);
    await fetchLikeOf(fetch, true)("https://example.org/", { method: "POST", headers: {}, body: '{"a":1}', redirect: "manual", signal });
    await fetchLikeOf(fetch, true)("https://example.org/", { method: "GET", headers: {}, redirect: "manual", signal });
    expect(requests.map(({ method, body }) => [method, body])).toEqual([
      ["POST", '{"a":1}'],
      [undefined, undefined],
    ]);
  });
});
