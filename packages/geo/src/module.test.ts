import * as home from "@mark1russell7/geo";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { describe, expect, it } from "vitest";
import { createGeoModule, geoHomeProcedures, geoManifest, geoModule } from "./module.js";

const registry = createRegistry(geoModule);
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await outputValue(await invokePath(["geo", name], input, { registry }), ["geo", name])) as T;

const boston = { lat: 42.3601, lon: -71.0589 };
const newYork = { lat: 40.7128, lon: -74.006 };

describe("the generated procedures of @procedures/geo", () => {
  it("gives the same value as the function of the home", async () => {
    expect(await call("distanceKm", { a: boston, b: newYork })).toBe(home.distanceKm(boston, newYork));
    expect(await call("initialBearing", { from: boston, to: newYork })).toBe(home.initialBearing(boston, newYork));
    expect(await call("destinationKm", { from: boston, bearingDegrees: 225, distance: 300 })).toEqual(home.destinationKm(boston, 225, 300));
    expect(await call("bboxOfPoints", { points: [boston, newYork] })).toEqual(home.bboxOfPoints([boston, newYork]));
    expect(await call("decodeGeohash", { hash: "drt2z" })).toEqual(home.decodeGeohash("drt2z"));
  });

  it("gives the value of geo.distance from geo.distanceKm with the radius 6371", async () => {
    const old = await call<{ km: number }>("distance", { from: boston, to: newYork });
    expect(await call("distanceKm", { a: boston, b: newYork, radiusKm: 6371 })).toBe(old.km);
    const deprecated = registry.get(["geo", "distance"]);
    expect(deprecated?.metadata.deprecated).toBe(true);
  });

  it("keeps the hand-written geo.geohash, and exempts the function of the home with that name", async () => {
    expect(await call<{ hash: string }>("geohash", { point: boston, precision: 5 })).toMatchObject({ hash: home.geohash(boston, 5) });
    expect(geoManifest.procedures.map((procedure) => procedure.name)).not.toContain("geohash");
    expect(geoManifest.exempt.find((exemption) => exemption.name === "geohash")?.reason).toBe("overlay");
  });

  it("names the functions with an output that is not JSON as exemptions", () => {
    expect(geoManifest.exempt.map((exemption) => exemption.name)).toEqual(["geohash", "lineReference", "parseGeoJson", "parseGeometry", "parseLatLon", "pointLocator", "regionSimplifier"]);
  });

  it("has a procedure with no effect for each other function of the home", () => {
    expect(geoManifest.procedures).toHaveLength(45);
    expect(geoHomeProcedures).toHaveLength(45);
    for (const procedure of geoManifest.procedures) expect(procedure.effects).toEqual({ reads: [], writes: [] });
  });

  it("gives the generated procedures also in the module with the settings of the host", () => {
    const hosted = createRegistry(createGeoModule({ fetch: async () => Response.json([]) }));
    expect(hosted.get(["geo", "distanceKm"])).toBeDefined();
    expect(hosted.get(["geo", "geocode"])).toBeDefined();
  });
});
