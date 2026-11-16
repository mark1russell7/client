import { describe, expect, it } from "vitest";
import * as root from "./index.js";
import { geoModule } from "./module.js";

describe("the package root", () => {
  it("gives the module, the procedures and the plain functions", () => {
    expect(root.geoModule).toBe(geoModule);
    expect(root.geoProcedures.length).toBeGreaterThan(0);
    for (const name of ["createGeoModule", "geocode", "drivingRoute", "greatCircleKm", "geohash", "decodeGeohash", "project", "fitZoom", "tilesFor"] as const) {
      expect(typeof root[name], name).toBe("function");
    }
    expect(root.EARTH_RADIUS_KM).toBe(6371);
    expect(root.decodeGeohash(root.geohash({ lat: 10, lon: 20 })).center.lat).toBeCloseTo(10, 5);
  });
});
