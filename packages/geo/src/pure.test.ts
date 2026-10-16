/**
 * The expected values come from the haversine formula on a sphere of 6371 km, computed one time
 * and fixed here. A change of the formula, the radius or the order of the operations changes them.
 */

import { describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { EARTH_RADIUS_KM, greatCircleKm } from "./distance.js";
import { decodeGeohash, geohash } from "./geohash.js";
import { geoProcedures } from "./procedures.js";

const EIFFEL = { lat: 48.8584, lon: 2.2945 };
const BRANDENBURG = { lat: 52.5163, lon: 13.3777 };
const OPERA = { lat: -33.8568, lon: 151.2153 };
const LIBERTY = { lat: 40.6892, lon: -74.0445 };

describe("greatCircleKm", () => {
  it("gives the fixed values of the haversine formula, without rounding", () => {
    expect(EARTH_RADIUS_KM).toBe(6371);
    const cases: Array<[{ lat: number; lon: number }, { lat: number; lon: number }, number]> = [
      [EIFFEL, BRANDENBURG, 879.0864603595937],
      [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, 111.19492664455873],
      [{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, 111.19492664455873],
      [OPERA, LIBERTY, 15984.279726609057],
      [{ lat: 10, lon: 179.5 }, { lat: 10, lon: -179.5 }, 109.50558394369477],
      [EIFFEL, { lat: 48.8606, lon: 2.3376 }, 3.16249928500955],
      [LIBERTY, LIBERTY, 0],
      [{ lat: 0, lon: 0 }, { lat: 0, lon: 180 }, 20015.086796020572],
      [{ lat: 90, lon: 0 }, { lat: -90, lon: 0 }, 20015.086796020572],
    ];
    for (const [a, b, km] of cases) {
      expect(greatCircleKm(a, b)).toBe(km);
      expect(greatCircleKm(b, a)).toBe(km);
    }
  });

  it("gives half the circumference, not NaN, for two antipodal points", () => {
    for (let lat = -80; lat <= 80; lat += 7.3) {
      const km = greatCircleKm({ lat, lon: 12.5 }, { lat: -lat, lon: -167.5 });
      expect(km).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 2);
    }
  });
});

describe("geohash", () => {
  it("gives the fixed values, with 7 characters when the caller gives no precision", () => {
    expect(geohash({ lat: 57.64911, lon: 10.40744 }, 11)).toBe("u4pruydqqvj");
    expect(geohash(EIFFEL)).toBe("u09tunq");
    expect(geohash(OPERA)).toBe("r3gx2ux");
    expect(geohash(OPERA, 9)).toBe("r3gx2ux9g");
    expect(geohash(LIBERTY)).toBe("dr5r7p4");
    expect(geohash(LIBERTY, 12)).toBe("dr5r7p4ry0eh");
    expect(geohash(LIBERTY, 5)).toBe("dr5r7");
    expect(geohash(LIBERTY, 1)).toBe("d");
  });

  it("puts a coordinate on the middle of a range in the upper half", () => {
    expect(geohash({ lat: 0, lon: 0 })).toBe("s000000");
    expect(geohash({ lat: 0, lon: -180 })).toBe("8000000");
    expect(geohash({ lat: -45, lon: 90 })).toBe("q000000");
    expect(geohash({ lat: 90, lon: 180 })).toBe("zzzzzzz");
    expect(geohash({ lat: -90, lon: -180 })).toBe("0000000");
  });

  it("refuses a point off the map and a precision out of 1 to 12", () => {
    expect(() => geohash({ lat: 91, lon: 0 })).toThrow(RangeError);
    expect(() => geohash({ lat: 0, lon: Number.NaN })).toThrow(RangeError);
    expect(() => geohash(EIFFEL, 0)).toThrow(RangeError);
    expect(() => geohash(EIFFEL, 13)).toThrow(RangeError);
    expect(() => geohash(EIFFEL, 2.5)).toThrow(RangeError);
  });
});

describe("decodeGeohash", () => {
  it("gives a cell that holds the point, and its center has the same geohash", () => {
    for (const point of [EIFFEL, BRANDENBURG, OPERA, LIBERTY]) {
      for (const precision of [1, 5, 7, 12]) {
        const hash = geohash(point, precision);
        const cell = decodeGeohash(hash);
        expect(point.lat).toBeGreaterThanOrEqual(cell.south);
        expect(point.lat).toBeLessThanOrEqual(cell.north);
        expect(point.lon).toBeGreaterThanOrEqual(cell.west);
        expect(point.lon).toBeLessThanOrEqual(cell.east);
        expect(geohash(cell.center, precision)).toBe(hash);
      }
    }
  });

  it("gives the edges of a cell, reads upper case and refuses a character outside the alphabet", () => {
    expect(decodeGeohash("s")).toEqual({ south: 0, west: 0, north: 45, east: 45, center: { lat: 22.5, lon: 22.5 } });
    expect(decodeGeohash("U09TUNQ")).toEqual(decodeGeohash("u09tunq"));
    expect(() => decodeGeohash("u09a")).toThrow(/"a"/);
    expect(() => decodeGeohash("")).toThrow(RangeError);
  });
});

describe("geo.distance and geo.geohash", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of geoProcedures) registry.register(procedure);
  const call = async <T>(path: string[], input: unknown): Promise<T> =>
    (await outputValue(await invokePath(path, input, { registry }), path)) as T;

  it("geo.distance gives the kilometres of greatCircleKm", async () => {
    expect(await call(["geo", "distance"], { from: EIFFEL, to: BRANDENBURG })).toEqual({ km: 879.0864603595937 });
  });

  it("geo.geohash gives the geohash and its cell, with 7 characters by default", async () => {
    const result = await call<{ hash: string; cell: unknown }>(["geo", "geohash"], { point: EIFFEL });
    expect(result).toEqual({ hash: "u09tunq", cell: decodeGeohash("u09tunq") });
    expect((await call<{ hash: string }>(["geo", "geohash"], { point: LIBERTY, precision: 12 })).hash).toBe("dr5r7p4ry0eh");
  });

  it("refuses a point off the map", async () => {
    await expect(call(["geo", "distance"], { from: { lat: 100, lon: 0 }, to: EIFFEL })).rejects.toThrow();
    await expect(call(["geo", "geohash"], { point: EIFFEL, precision: 13 })).rejects.toThrow();
  });
});
