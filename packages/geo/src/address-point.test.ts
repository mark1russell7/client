/**
 * The procedure geo.addressPoint: one GET to the Census Geocoder, at the pace of its host.
 */
import { InvocationError, createRegistry, invokePath, outputValue } from "@procedures/client";
import type { Pace } from "polite-crawler/api";
import { HostScheduler } from "polite-crawler/politeness";
import { describe, expect, it, vi } from "vitest";
import { CENSUS_GEOCODER_ATTRIBUTION, CENSUS_GEOCODER_HOST } from "./census.js";
import { createGeoModule } from "./module.js";
import type { GeoFetch } from "./polite.js";
import { geoAddressPoint } from "./procedures/geo/addressPoint.js";

const userAgent = "test-app/1.0 (test@example.org)";
const address = { street: "12 Made Up Rd", city: "Sometown", state: "VT", userAgent };
const answer = { result: { addressMatches: [{ tigerLine: { side: "L", tigerLineId: "99" }, coordinates: { x: -72.5, y: 44.25 }, matchedAddress: "12 MADE UP RD, SOMETOWN, VT, 05000" }] } };

/** A pace on a test clock: each rest moves the clock, and no test waits. */
function testPace(): Pace {
  let time = 1_000_000;
  const clock = { now: () => time, sleep: async (ms: number) => void (time += ms) };
  return { scheduler: new HostScheduler(clock, 4), now: clock.now };
}

/** A fetch that records each request, and gives one answer. */
function recordingFetch(body: unknown, status = 200) {
  const requests: { url: string; method: string | undefined; headers: Record<string, string> }[] = [];
  const fetch: GeoFetch = async (url, init) => {
    requests.push({ url, method: init.method, headers: init.headers });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status === 200, status, headers: { "content-type": "application/json" }, text: async () => text, json: async () => JSON.parse(text) as unknown };
  };
  return { fetch, requests };
}

describe("geo.addressPoint", () => {
  it("sends one GET of the address to the Census Geocoder, and gives the matches", async () => {
    const { fetch, requests } = recordingFetch(answer);
    const output = await geoAddressPoint(address, { fetch, pace: testPace() });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]?.url ?? "");
    expect(url.hostname).toBe(CENSUS_GEOCODER_HOST);
    expect(url.searchParams.get("street")).toBe("12 Made Up Rd");
    expect(requests[0]?.method ?? "GET").toBe("GET");
    expect(requests[0]?.headers).toMatchObject({ "user-agent": userAgent });
    expect(output).toEqual({ matches: [{ lat: 44.25, lon: -72.5, matchedAddress: "12 MADE UP RD, SOMETOWN, VT, 05000", side: "L", tigerLineId: "99" }], attribution: CENSUS_GEOCODER_ATTRIBUTION });
  });

  it("gives no match for an address with no range, and fails for a status other than 200", async () => {
    expect((await geoAddressPoint(address, { fetch: recordingFetch({ result: { addressMatches: [] } }).fetch, pace: testPace() })).matches).toEqual([]);
    await expect(geoAddressPoint(address, { fetch: recordingFetch("Bad request", 400).fetch, pace: testPace() })).rejects.toThrow(/Census Geocoder gave 400/);
  });

  it("is a procedure of the module that reads the network, and keeps the refusal of the host policy", async () => {
    const registry = createRegistry(createGeoModule({ fetch: recordingFetch(answer).fetch, pace: testPace() }));
    const path = ["geo", "addressPoint"];
    expect(registry.get(path)?.metadata.effects).toEqual({ reads: ["network"], writes: [] });
    const output = (await outputValue(await invokePath(path, address, { registry }), path)) as { matches: unknown[] };
    expect(output.matches).toHaveLength(1);
    const refusal = new InvocationError("FORBIDDEN", "the host is not allowed", ["http", "request"], "host-not-allowed");
    const refused = createRegistry(createGeoModule({ fetch: vi.fn<GeoFetch>(async () => Promise.reject(refusal)), pace: testPace() }));
    await expect(invokePath(path, address, { registry: refused }).then((result) => outputValue(result, path))).rejects.toMatchObject({ code: "FORBIDDEN", reason: "host-not-allowed" });
  });

  it("refuses an address with no city and no ZIP code before a request", async () => {
    const fetch = vi.fn<GeoFetch>();
    const registry = createRegistry(createGeoModule({ fetch, pace: testPace() }));
    const path = ["geo", "addressPoint"];
    await expect(invokePath(path, { street: "12 Made Up Rd", state: "VT", userAgent }, { registry }).then((result) => outputValue(result, path))).rejects.toThrow(/city/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
