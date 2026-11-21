import { InvocationError, createRegistry, invokePath, outputValue } from "@procedures/client";
import type { Pace } from "polite-crawler/api";
import { HostScheduler } from "polite-crawler/politeness";
import { describe, expect, it, vi } from "vitest";
import { createGeoModule } from "./module.js";
import { fetchLikeOf, geoPace, type GeoFetch, type GeoFetchResponse } from "./polite.js";
import { geoArcgisFeatures } from "./procedures/geo/arcgisFeatures.js";
import { geoOsmFeatures } from "./procedures/geo/osmFeatures.js";

// Made-up places near the point at latitude 0 and longitude 0.
const box = { west: 0, south: 0, east: 0.01, north: 0.01 };
const userAgent = "test-app/1.0 (test@example.org)";
const layerUrl = "https://gis.example.org/arcgis/rest/services/Zones/FeatureServer/0";

/** A pace on a test clock: each rest moves the clock, and no test waits. */
function testPace(): Pace & { readonly clock: { now: () => number } } {
  let time = 1_000_000;
  const clock = { now: () => time, sleep: async (ms: number) => void (time += ms) };
  return { scheduler: new HostScheduler(clock, 4), now: clock.now, clock };
}

/** A fetch that gives each answer of the list in sequence, with the headers as a record, as `createHostFetch()` does. */
function scriptedFetch(answers: readonly { status?: number; body: unknown; headers?: Record<string, string> }[]) {
  const urls: string[] = [];
  const agents: (string | undefined)[] = [];
  let next = 0;
  const fetch: GeoFetch = async (url, init) => {
    urls.push(url);
    agents.push(init.headers["user-agent"]);
    const answer = answers[Math.min(next++, answers.length - 1)]!;
    const text = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    const status = answer.status ?? 200;
    return { ok: status === 200, status, headers: answer.headers ?? { "content-type": "application/json" }, text: async () => text, json: async () => JSON.parse(text) as unknown };
  };
  return { fetch, urls, agents };
}

const overpassAnswer = {
  osm3s: { timestamp_osm_base: "2026-01-01T00:00:00Z", copyright: "The data is from OpenStreetMap, ODbL 1.0." },
  elements: [{ type: "node", id: 1, lat: 0.001, lon: 0.002, tags: { amenity: "shelter" } }],
};

const feature = (id: number) => ({ type: "Feature", id, geometry: { type: "Point", coordinates: [0.001 * id, 0] }, properties: { ZONE: `Z${id}` } });
const page = (ids: number[], more: boolean) => ({ type: "FeatureCollection", features: ids.map(feature), ...(more ? { properties: { exceededTransferLimit: true } } : {}) });

describe("geo.osmFeatures", () => {
  it("sends one Overpass query with the User-Agent of the caller, and gives the features", async () => {
    const { fetch, urls, agents } = scriptedFetch([{ body: overpassAnswer }]);
    const output = await geoOsmFeatures({ bbox: box, selectors: [{ key: "amenity", values: ["shelter"] }], userAgent, baseUrl: "https://overpass.example.org/api/interpreter" }, { fetch, pace: testPace() });
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]!).host).toBe("overpass.example.org");
    expect(new URL(urls[0]!).searchParams.get("data")).toContain('nwr["amenity"="shelter"]');
    expect(agents).toEqual([userAgent]);
    expect(output.collection.features).toEqual([{ type: "Feature", id: "node/1", geometry: { type: "Point", coordinates: [0.002, 0.001] }, properties: { amenity: "shelter" } }]);
    expect(output.attribution).toBe("The data is from OpenStreetMap, ODbL 1.0.");
  });

  it("gives an error with the status of an answer that is not 200, and parks the host after a 429", async () => {
    const pace = testPace();
    const { fetch, urls } = scriptedFetch([{ status: 429, body: "busy", headers: { "retry-after": "120" } }, { body: overpassAnswer }]);
    const input = { bbox: box, selectors: [{ key: "amenity" }], userAgent };
    await expect(geoOsmFeatures(input, { fetch, pace })).rejects.toThrow(/Overpass API gave 429/);
    const before = pace.clock.now();
    await geoOsmFeatures(input, { fetch, pace });
    expect(urls).toHaveLength(2);
    expect(pace.clock.now() - before).toBeGreaterThanOrEqual(120_000);
  });

  it("refuses a body that is not JSON", async () => {
    const { fetch } = scriptedFetch([{ body: "<html>error</html>", headers: { "content-type": "text/html" } }]);
    await expect(geoOsmFeatures({ bbox: box, selectors: [{ key: "amenity" }], userAgent }, { fetch, pace: testPace() })).rejects.toThrow(/not JSON/);
  });
});

describe("geo.arcgisFeatures", () => {
  it("asks for the pages in sequence until the last page, and keeps each feature with an id one time", async () => {
    const { fetch, urls } = scriptedFetch([{ body: page([1, 2], true) }, { body: page([2, 3], false) }]);
    const output = await geoArcgisFeatures({ layerUrl, bbox: box, userAgent, pageSize: 2 }, { fetch, pace: testPace() });
    expect(output.requests).toBe(2);
    expect(output.truncated).toBe(false);
    expect(output.collection.features.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(urls.map((url) => new URL(url).searchParams.get("resultOffset"))).toEqual(["0", "2"]);
  });

  it("stops at maxFeatures, and tells that the output is truncated", async () => {
    const { fetch, urls } = scriptedFetch([{ body: page([1, 2], true) }]);
    const output = await geoArcgisFeatures({ layerUrl, bbox: box, userAgent, pageSize: 5, maxFeatures: 2 }, { fetch, pace: testPace() });
    expect(output).toMatchObject({ requests: 1, truncated: true });
    expect(new URL(urls[0]!).searchParams.get("resultRecordCount")).toBe("2");
  });

  it("stops when the layer tells of more features but gives none", async () => {
    const { fetch } = scriptedFetch([{ body: page([], true) }]);
    expect(await geoArcgisFeatures({ layerUrl, bbox: box, userAgent }, { fetch, pace: testPace() })).toMatchObject({ requests: 1, truncated: true });
  });

  it("sends one query for each part of a box across the antimeridian", async () => {
    const { fetch, urls } = scriptedFetch([{ body: page([1], false) }, { body: page([1, 2], false) }]);
    const output = await geoArcgisFeatures({ layerUrl, bbox: { west: 179.9, south: 0, east: -179.9, north: 0.1 }, userAgent }, { fetch, pace: testPace() });
    expect(urls.map((url) => new URL(url).searchParams.get("geometry"))).toEqual(["179.9,0,180,0.1", "-180,0,-179.9,0.1"]);
    expect(output.collection.features.map((item) => item.id)).toEqual([1, 2]);
  });

  it("gives the error of the layer", async () => {
    const { fetch } = scriptedFetch([{ body: { error: { code: 498, message: "Invalid token." } } }]);
    await expect(geoArcgisFeatures({ layerUrl, bbox: box, userAgent }, { fetch, pace: testPace() })).rejects.toThrow(/refused the query: 498 Invalid token/);
  });
});

describe("the transport over the fetch of the module", () => {
  it("reads the headers of a Headers and of a record, and refuses a method that is not GET", async () => {
    const headers = new Headers({ "Retry-After": "5" });
    const like = fetchLikeOf(async () => ({ ok: true, status: 200, headers, json: async () => ({}), text: async () => "{}" }));
    const response = await like("https://example.org/", { method: "GET", headers: {}, redirect: "manual", signal: new AbortController().signal });
    const seen: string[] = [];
    response.headers.forEach((value, name) => seen.push(`${name}=${value}`));
    expect(seen).toEqual(["retry-after=5"]);
    await expect(like("https://example.org/", { method: "POST", headers: {}, redirect: "manual", signal: new AbortController().signal })).rejects.toThrow(/only GET/);
  });

  it("refuses a fetch with no text()", async () => {
    const jsonOnly: GeoFetch = async (): Promise<GeoFetchResponse> => ({ ok: true, status: 200, json: async () => ({}) });
    await expect(geoOsmFeatures({ bbox: box, selectors: [{ key: "amenity" }], userAgent }, { fetch: jsonOnly, pace: testPace() })).rejects.toThrow(/no text\(\)/);
  });

  it("gives one pace for the process", () => {
    expect(geoPace()).toBe(geoPace());
  });
});

describe("the map data procedures in a module", () => {
  it("use the fetch and the pace of the host", async () => {
    const { fetch, urls } = scriptedFetch([{ body: overpassAnswer }]);
    const registry = createRegistry(createGeoModule({ fetch, pace: testPace() }));
    const path = ["geo", "osmFeatures"];
    const output = (await outputValue(await invokePath(path, { bbox: box, selectors: [{ key: "amenity", values: ["shelter"] }], userAgent }, { registry }), path)) as { collection: { features: unknown[] } };
    expect(output.collection.features).toHaveLength(1);
    expect(urls).toHaveLength(1);
    expect(registry.get(["geo", "arcgisFeatures"])?.metadata.effects).toEqual({ reads: ["network"], writes: [] });
  });

  it("keep the refusal of the host policy, with its code and its reason", async () => {
    const refusal = new InvocationError("FORBIDDEN", "the host of the URL is not allowed: 10.0.0.5 is a private address", ["geo", "arcgisFeatures"], "host-not-allowed");
    const fetch = vi.fn<GeoFetch>(async () => Promise.reject(refusal));
    const registry = createRegistry(createGeoModule({ fetch, pace: testPace() }));
    const calls: Array<[string[], unknown]> = [
      [["geo", "osmFeatures"], { bbox: box, selectors: [{ key: "amenity" }], userAgent, baseUrl: "http://10.0.0.5/api/interpreter" }],
      [["geo", "arcgisFeatures"], { layerUrl: "http://10.0.0.5/arcgis/rest/services/Zones/FeatureServer/0", bbox: box, userAgent }],
    ];
    for (const [path, input] of calls) {
      await expect(invokePath(path, input, { registry }).then((output) => outputValue(output, path))).rejects.toMatchObject({ code: "FORBIDDEN", reason: "host-not-allowed" });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuse an input with no User-Agent, and a box with its south north of its north", async () => {
    const fetch = vi.fn<GeoFetch>();
    const registry = createRegistry(createGeoModule({ fetch, pace: testPace() }));
    const path = ["geo", "osmFeatures"];
    await expect(invokePath(path, { bbox: box, selectors: [{ key: "amenity" }] }, { registry }).then((output) => outputValue(output, path))).rejects.toThrow(/userAgent/);
    await expect(
      invokePath(path, { bbox: { ...box, south: 0.02 }, selectors: [{ key: "amenity" }], userAgent }, { registry }).then((output) => outputValue(output, path))
    ).rejects.toThrow(/south/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
