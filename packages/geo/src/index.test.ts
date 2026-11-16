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
    const cell = root.decodeGeohash(root.geohash({ lat: 10, lon: 20 }));
    expect(cell.south <= 10 && 10 <= cell.north && cell.west <= 20 && 20 <= cell.east).toBe(true);
  });
});
