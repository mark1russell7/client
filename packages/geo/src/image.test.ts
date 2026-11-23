import { describe, expect, it } from "vitest";
import { MAX_URL_LENGTH } from "./features.js";
import { ELEVATION_URL, imageSamples, imageSamplesExchange, isArcgisImageUrl } from "./image.js";

const points = [
  { lon: -71.0656, lat: 42.3551 },
  { lon: -71.3033, lat: 44.2706 },
  { lon: -71.29, lat: 44.26 },
];

// The answer of the 3DEP image service for these points, read on 2026-11-23
const answer = {
  samples: [
    { location: { x: -71.0656, y: 42.3551, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 0, value: "6.231191635", rasterId: 140426, resolution: 1 },
    { location: { x: -71.3033, y: 44.2706, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 1, value: "1912.359008789", rasterId: 37183, resolution: 1 },
    { location: { x: -71.29, y: 44.26, spatialReference: { wkid: 4326, latestWkid: 4326 } }, locationId: 2, value: "1212.541625977", rasterId: 37183, resolution: 1 },
  ],
};

describe("isArcgisImageUrl", () => {
  it("is true only for the URL of an image service", () => {
    expect(isArcgisImageUrl(ELEVATION_URL)).toBe(true);
    expect(isArcgisImageUrl(`${ELEVATION_URL}/`)).toBe(true);
    expect(isArcgisImageUrl("https://example.test/arcgis/rest/services/x/MapServer/0")).toBe(false);
    expect(isArcgisImageUrl(`${ELEVATION_URL}?f=json`)).toBe(false);
    expect(isArcgisImageUrl("ftp://example.test/ImageServer")).toBe(false);
    expect(isArcgisImageUrl("not a url")).toBe(false);
  });
});

describe("imageSamplesExchange", () => {
  it("gives a GET of getSamples with the points as a multipoint in WGS84 and the user agent", () => {
    const exchange = imageSamplesExchange(points, "test-agent/1.0");
    expect(exchange.method).toBe("GET");
    expect(exchange.headers).toMatchObject({ "user-agent": "test-agent/1.0" });
    const url = new URL(exchange.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${ELEVATION_URL}/getSamples`);
    expect(JSON.parse(url.searchParams.get("geometry") ?? "")).toEqual({ points: points.map(({ lon, lat }) => [lon, lat]), spatialReference: { wkid: 4326 } });
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryMultipoint");
    expect(url.searchParams.get("returnFirstValueOnly")).toBe("true");
    expect(url.searchParams.get("interpolation")).toBe("RSP_BilinearInterpolation");
    expect(url.searchParams.get("f")).toBe("json");
  });

  it("takes another image service and the nearest cell", () => {
    const exchange = imageSamplesExchange(points, "a", { serviceUrl: "https://example.test/arcgis/rest/services/dem/ImageServer/", interpolation: "nearest" });
    const url = new URL(exchange.url);
    expect(url.pathname).toBe("/arcgis/rest/services/dem/ImageServer/getSamples");
    expect(url.searchParams.get("interpolation")).toBe("RSP_NearestNeighbor");
  });

  it("refuses no point, a point that is not on the map, a URL that is not an image service and a URL that is too long", () => {
    expect(() => imageSamplesExchange([], "a")).toThrow(RangeError);
    expect(() => imageSamplesExchange([{ lon: -181, lat: 44 }], "a")).toThrow(RangeError);
    expect(() => imageSamplesExchange([{ lon: -70, lat: Number.NaN }], "a")).toThrow(RangeError);
    expect(() => imageSamplesExchange(points, "a", { serviceUrl: "https://example.test/x/MapServer/0" })).toThrow(RangeError);
    const many = Array.from({ length: MAX_URL_LENGTH / 10 }, (_, i) => ({ lon: -71 + i / 1e5, lat: 44 }));
    expect(() => imageSamplesExchange(many, "a")).toThrow(/send fewer points/);
  });
});

describe("imageSamples", () => {
  it("gives the value at each point, in the order of the points", () => {
    expect(imageSamples(answer, points)).toEqual([
      { lon: -71.0656, lat: 42.3551, value: 6.231191635, resolution: 1 },
      { lon: -71.3033, lat: 44.2706, value: 1912.359008789, resolution: 1 },
      { lon: -71.29, lat: 44.26, value: 1212.541625977, resolution: 1 },
    ]);
  });

  it("gives null for NoData and for a point that the answer does not give", () => {
    const partial = { samples: [{ locationId: 1, value: "NoData", resolution: 10 }, { locationId: 1, value: "5", resolution: 1 }] };
    expect(imageSamples(partial, points)).toEqual([
      { lon: -71.0656, lat: 42.3551, value: null, resolution: null },
      { lon: -71.3033, lat: 44.2706, value: null, resolution: 10 },
      { lon: -71.29, lat: 44.26, value: null, resolution: null },
    ]);
  });

  it("refuses an ArcGIS error and an answer with no samples", () => {
    expect(() => imageSamples({ error: { code: 400, message: "Invalid geometry" } }, points)).toThrow(/refused the request: 400 Invalid geometry/);
    expect(() => imageSamples({}, points)).toThrow(/no list of samples/);
    expect(() => imageSamples({ samples: [1] }, points)).toThrow(/not an object/);
  });
});
