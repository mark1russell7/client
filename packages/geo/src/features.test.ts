import { ringWinding, type Polygon, type Position } from "@mark1russell7/geo";
import { describe, expect, it } from "vitest";
import {
  MAX_URL_LENGTH,
  OSM_ATTRIBUTION,
  arcgisExchange,
  arcgisPage,
  bboxParts,
  isArcgisLayerUrl,
  isOsmArea,
  joinRings,
  osmFeatures,
  overpassExchange,
  overpassQuery,
} from "./features.js";

// Made-up places near the point at latitude 0 and longitude 0.
const box = { west: 0, south: 0, east: 0.01, north: 0.01 };
const agent = "test-app/1.0 (test@example.org)";
const point = (lon: number, lat: number) => ({ lat, lon });
const square = [point(0, 0), point(0.004, 0), point(0.004, 0.004), point(0, 0.004), point(0, 0)];
/** The box of the tests as Overpass writes it: south, west, north and east, with 7 decimals. */
const inBox = `(${[box.south, box.west, box.north, box.east].map((value) => value.toFixed(7)).join(",")})`;

describe("overpassQuery", () => {
  it("selects one value with =, many values with an anchored pattern, and a key with each value", () => {
    const query = overpassQuery(box, [{ key: "amenity", values: ["shelter"] }, { key: "emergency", values: ["assembly_point", "a.b"] }, { key: "building" }]);
    expect(query).toBe(
      '[out:json][timeout:60];(' +
        'nwr["amenity"="shelter"]' + inBox + ';' +
        'nwr["emergency"~"^(assembly_point|a\\\\.b)$"]' + inBox + ';' +
        'nwr["building"]' + inBox + ';' +
        ');out geom;'
    );
  });

  it("gives one statement for each kind of a selector with only some kinds", () => {
    const query = overpassQuery(box, [{ key: "highway", kinds: ["way", "relation"] }], 30);
    expect(query).toContain("[timeout:30]");
    expect(query).toContain('way["highway"](');
    expect(query).toContain('relation["highway"](');
    expect(query).not.toContain("nwr");
  });

  it("escapes a quote and a backslash in a key or a value", () => {
    expect(overpassQuery(box, [{ key: 'a"b', values: ["c\\d"] }])).toContain('["a\\"b"="c\\\\d"]');
  });

  it("gives two parts for a box that crosses the antimeridian", () => {
    expect(bboxParts({ west: 179.9, south: 0, east: -179.9, north: 0.1 })).toEqual([
      { west: 179.9, south: 0, east: 180, north: 0.1 },
      { west: -180, south: 0, east: -179.9, north: 0.1 },
    ]);
    const query = overpassQuery({ west: 179.9, south: 0, east: -179.9, north: 0.1 }, [{ key: "place" }]);
    expect(query.match(/nwr\["place"\]/g)).toHaveLength(2);
  });

  it("refuses no selector, a control character, a box off the map and a bad time limit", () => {
    expect(() => overpassQuery(box, [])).toThrow(RangeError);
    expect(() => overpassQuery(box, [{ key: "a\nb" }])).toThrow(/control character/);
    expect(() => overpassQuery({ ...box, north: 91 }, [{ key: "a" }])).toThrow(/not on the map/);
    expect(() => overpassQuery({ ...box, south: 0.02 }, [{ key: "a" }])).toThrow(/south/);
    expect(() => overpassQuery(box, [{ key: "a" }], 0)).toThrow(/time limit/);
  });
});

describe("overpassExchange", () => {
  it("sends the query in the parameter data of a GET, with the User-Agent of the caller", () => {
    const query = overpassQuery(box, [{ key: "amenity", values: ["shelter"] }]);
    const exchange = overpassExchange(query, agent, "https://overpass.example.org/api/interpreter");
    expect(exchange.method).toBe("GET");
    expect(exchange.body).toBeNull();
    expect(exchange.headers["user-agent"]).toBe(agent);
    expect(new URL(exchange.url).searchParams.get("data")).toBe(query);
    expect(new URL(exchange.url).host).toBe("overpass.example.org");
  });

  it("refuses a URL that is too long", () => {
    expect(() => overpassExchange("x".repeat(MAX_URL_LENGTH), agent)).toThrow(/fewer selectors/);
  });
});

describe("isOsmArea", () => {
  it("follows area=yes and area=no first, then the rules of each key", () => {
    expect(isOsmArea({ building: "yes" })).toBe(true);
    expect(isOsmArea({ building: "yes", area: "no" })).toBe(false);
    expect(isOsmArea({ highway: "residential" })).toBe(false);
    expect(isOsmArea({ highway: "residential", area: "yes" })).toBe(true);
    expect(isOsmArea({ highway: "rest_area" })).toBe(true);
    expect(isOsmArea({ natural: "coastline" })).toBe(false);
    expect(isOsmArea({ natural: "water" })).toBe(true);
    expect(isOsmArea({ barrier: "fence" })).toBe(false);
    expect(isOsmArea({ amenity: "no" })).toBe(false);
    expect(isOsmArea({ name: "A" })).toBe(false);
  });
});

describe("joinRings", () => {
  it("joins lines at their ends, also a reversed line, and counts the lines with no ring", () => {
    const a: Position[] = [[0, 0], [1, 0], [1, 1]];
    const b: Position[] = [[0, 0], [0, 1], [1, 1]];
    const lone: Position[] = [[5, 5], [6, 6]];
    const { rings, open } = joinRings([a, lone, b]);
    expect(rings).toEqual([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]);
    expect(open).toBe(1);
  });
});

describe("osmFeatures", () => {
  const answer = (elements: unknown[], extra: Record<string, unknown> = {}) => ({
    version: 0.6,
    osm3s: { timestamp_osm_base: "2026-01-01T00:00:00Z", copyright: "The data is from OpenStreetMap, ODbL 1.0." },
    elements,
    ...extra,
  });

  it("gives a point for a node, a polygon for a closed area and a line for another way", () => {
    const result = osmFeatures(
      answer([
        { type: "node", id: 1, lat: 0.001, lon: 0.002, tags: { amenity: "shelter", name: "Shelter A" } },
        { type: "way", id: 2, geometry: [...square].reverse(), tags: { building: "yes" } },
        { type: "way", id: 3, geometry: square, tags: { highway: "residential" } },
        { type: "way", id: 4, geometry: [point(0, 0), point(0.001, 0.001)], tags: { highway: "path" } },
      ])
    );
    const [shelter, building, loop, path] = result.collection.features;
    expect(shelter).toEqual({ type: "Feature", id: "node/1", geometry: { type: "Point", coordinates: [0.002, 0.001] }, properties: { amenity: "shelter", name: "Shelter A" } });
    expect(building?.geometry.type).toBe("Polygon");
    expect(ringWinding((building?.geometry as Polygon).coordinates[0]!)).toBe("counterclockwise");
    expect(loop?.geometry.type).toBe("LineString");
    expect(path?.geometry).toEqual({ type: "LineString", coordinates: [[0, 0], [0.001, 0.001]] });
    expect(result.dataAt).toBe("2026-01-01T00:00:00Z");
    expect(result.attribution).toBe("The data is from OpenStreetMap, ODbL 1.0.");
    expect(result.skipped).toEqual([]);
  });

  it("joins the ways of a multipolygon, and puts each inner ring in its outer ring", () => {
    const outerA = [point(0, 0), point(0.01, 0), point(0.01, 0.01)];
    const outerB = [point(0, 0), point(0, 0.01), point(0.01, 0.01)];
    const inner = [point(0.004, 0.004), point(0.006, 0.004), point(0.006, 0.006), point(0.004, 0.006), point(0.004, 0.004)];
    const far = [point(0.5, 0.5), point(0.6, 0.5), point(0.6, 0.6), point(0.5, 0.5)];
    const result = osmFeatures(
      answer([
        {
          type: "relation",
          id: 5,
          tags: { type: "multipolygon", landuse: "residential" },
          members: [
            { type: "way", ref: 51, role: "outer", geometry: outerA },
            { type: "way", ref: 52, role: "outer", geometry: outerB },
            { type: "way", ref: 53, role: "inner", geometry: inner },
            { type: "way", ref: 54, role: "inner", geometry: far },
            { type: "node", ref: 55, role: "label", lat: 0.005, lon: 0.005 },
          ],
        },
      ])
    );
    const feature = result.collection.features[0]!;
    expect(feature.id).toBe("relation/5");
    const polygon = feature.geometry as Polygon;
    expect(polygon.type).toBe("Polygon");
    expect(polygon.coordinates).toHaveLength(2);
    expect(ringWinding(polygon.coordinates[0]!)).toBe("counterclockwise");
    expect(ringWinding(polygon.coordinates[1]!)).toBe("clockwise");
    expect(result.skipped).toEqual([{ id: "relation/5", reason: "the feature is not complete: an inner ring is outside each outer ring" }]);
  });

  it("gives a multipolygon for two outer rings, and the lines of the ways of another relation", () => {
    const second = square.map(({ lat, lon }) => point(lon + 0.005, lat));
    const result = osmFeatures(
      answer([
        { type: "relation", id: 6, tags: { type: "multipolygon", building: "yes" }, members: [{ type: "way", role: "outer", geometry: square }, { type: "way", role: "outer", geometry: second }] },
        { type: "relation", id: 7, tags: { type: "route", route: "evacuation" }, members: [{ type: "way", role: "", geometry: [point(0, 0), point(0.001, 0)] }] },
      ])
    );
    expect(result.collection.features.map((feature) => feature.geometry.type)).toEqual(["MultiPolygon", "MultiLineString"]);
  });

  it("puts each element with no geometry in skipped, with its reason", () => {
    const result = osmFeatures(
      answer([
        { type: "node", id: 8, tags: {} },
        { type: "way", id: 9, nodes: [1, 2], tags: { highway: "path" } },
        { type: "relation", id: 10, tags: { type: "multipolygon" }, members: [{ type: "way", role: "outer", geometry: [point(0, 0), point(1, 1)] }] },
      ])
    );
    expect(result.collection.features).toEqual([]);
    expect(result.skipped.map((skip) => skip.id)).toEqual(["node/8", "way/9", "relation/10"]);
    expect(result.skipped[2]?.reason).toMatch(/no closed outer ring/);
  });

  it("keeps only the tags with a text value, and gives the default attribution", () => {
    const result = osmFeatures({ elements: [{ type: "node", id: 11, lat: 0, lon: 0, tags: { name: "A", bad: 3 } }] });
    expect(result.collection.features[0]?.properties).toEqual({ name: "A" });
    expect(result.attribution).toBe(OSM_ATTRIBUTION);
    expect(result.dataAt).toBeUndefined();
  });

  it("refuses an answer with no elements, and an answer with a runtime error", () => {
    expect(() => osmFeatures("<html>")).toThrow(/not an Overpass answer/);
    expect(() => osmFeatures(answer([], { remark: 'runtime error: Query timed out in "query" at line 1 after 60 seconds.' }))).toThrow(/Overpass stopped the query/);
  });
});

describe("arcgisExchange", () => {
  const layerUrl = "https://gis.example.org/arcgis/rest/services/Zones/FeatureServer/0";

  it("asks for one page of GeoJSON in WGS84 that intersects the box", () => {
    const exchange = arcgisExchange({ layerUrl, bbox: box, offset: 2000, pageSize: 1000, userAgent: agent, outFields: ["ZONE", "NAME"] });
    const url = new URL(exchange.url);
    expect(url.pathname).toBe("/arcgis/rest/services/Zones/FeatureServer/0/query");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      where: "1=1",
      geometry: "0,0,0.01,0.01",
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "ZONE,NAME",
      returnGeometry: "true",
      outSR: "4326",
      resultOffset: "2000",
      resultRecordCount: "1000",
      f: "geojson",
    });
    expect(exchange.headers["user-agent"]).toBe(agent);
  });

  it("refuses a URL that is not a layer, a box across the antimeridian and a bad page", () => {
    expect(isArcgisLayerUrl(layerUrl)).toBe(true);
    expect(isArcgisLayerUrl("https://gis.example.org/arcgis/rest/services/Zones/MapServer/3/")).toBe(true);
    expect(isArcgisLayerUrl("https://gis.example.org/arcgis/rest/services/Zones/FeatureServer")).toBe(false);
    expect(isArcgisLayerUrl(`${layerUrl}?f=json`)).toBe(false);
    expect(isArcgisLayerUrl("ftp://gis.example.org/FeatureServer/0")).toBe(false);
    expect(() => arcgisExchange({ layerUrl: "https://gis.example.org/", bbox: box, offset: 0, pageSize: 1, userAgent: agent })).toThrow(/not the URL of an ArcGIS layer/);
    expect(() => arcgisExchange({ layerUrl, bbox: { ...box, west: 1, east: -1 }, offset: 0, pageSize: 1, userAgent: agent })).toThrow(/antimeridian/);
    expect(() => arcgisExchange({ layerUrl, bbox: box, offset: -1, pageSize: 1, userAgent: agent })).toThrow(/offset/);
  });
});

describe("arcgisPage", () => {
  const feature = { type: "Feature", id: 1, geometry: { type: "Point", coordinates: [0, 0] }, properties: { ZONE: "A" } };

  it("gives the features, and tells of more features from exceededTransferLimit", () => {
    expect(arcgisPage({ type: "FeatureCollection", features: [feature] })).toEqual({ features: [feature], more: false });
    expect(arcgisPage({ type: "FeatureCollection", features: [], properties: { exceededTransferLimit: true } }).more).toBe(true);
    expect(arcgisPage({ type: "FeatureCollection", features: [], exceededTransferLimit: true }).more).toBe(true);
  });

  it("refuses an error of ArcGIS, an answer that is not a collection and a bad feature", () => {
    expect(() => arcgisPage({ error: { code: 400, message: "Invalid query parameters", details: [] } })).toThrow(/refused the query: 400 Invalid query parameters/);
    expect(() => arcgisPage({ type: "Feature" })).toThrow(/not a GeoJSON feature collection/);
    expect(() => arcgisPage({ type: "FeatureCollection", features: [{ type: "Point" }] })).toThrow(/not a GeoJSON feature/);
    expect(() => arcgisPage({ type: "FeatureCollection", features: [{ type: "Feature", geometry: 3 }] })).toThrow(/geometry/);
  });
});
