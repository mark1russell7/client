/**
 * The map data of an area as GeoJSON: the features of OpenStreetMap (the Overpass API) and the
 * features of an ArcGIS feature layer. The request builders and the extractors are pure functions.
 * The procedures `geo.osmFeatures` and `geo.arcgisFeatures` send the requests through
 * `polite-crawler/api`.
 */

import { locatePoint, parseGeometry, rewind, type BBox, type Geometry, type MultiPolygon, type Polygon, type Position } from "@mark1russell7/geo";
import type { Exchange } from "polite-crawler/api";

/** The main public Overpass server. Its policy asks for a User-Agent and for moderate use. */
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** The longest URL of a request. Many servers refuse a longer URL. */
export const MAX_URL_LENGTH = 8000;

/** A kind of OpenStreetMap element. */
export type OsmKind = "node" | "way" | "relation";

/** One selector of OpenStreetMap elements: a tag key, its values (any value when absent) and the kinds of elements (each kind when absent). */
export interface OsmSelector {
  readonly key: string;
  readonly values?: readonly string[] | undefined;
  readonly kinds?: readonly OsmKind[] | undefined;
}

/** A feature of OpenStreetMap: its id (for example `way/123`), its geometry and its tags. */
export type OsmFeature = {
  readonly type: "Feature";
  readonly id: string;
  readonly geometry: Geometry;
  readonly properties: Readonly<Record<string, string>>;
};

/** An element that has no feature, and the reason. */
export type SkippedElement = { readonly id: string; readonly reason: string };

/** The features of an Overpass answer, the elements with no feature, and the facts of the data. */
export type OsmFeatures = {
  readonly collection: { readonly type: "FeatureCollection"; readonly features: readonly OsmFeature[] };
  readonly skipped: readonly SkippedElement[];
  /** This value is the time of the OpenStreetMap data of the server, when the answer has it. */
  readonly dataAt?: string | undefined;
  /** This value is the copyright text of the answer. */
  readonly attribution: string;
};

/** A feature of an ArcGIS layer, as the layer gives it in GeoJSON. */
export type ArcgisFeature = {
  readonly type: "Feature";
  readonly id?: string | number | undefined;
  readonly geometry: Geometry | null;
  readonly properties: Readonly<Record<string, unknown>> | null;
};

/** One page of the answer of an ArcGIS layer query. */
export type ArcgisPage = {
  readonly features: readonly ArcgisFeature[];
  /** This value is true when the layer has more features after this page. */
  readonly more: boolean;
};

/** The text of the OpenStreetMap license, when the answer of the server has no copyright text. */
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0";

/**
 * The tag rules that make a closed way an area, from the page "Overpass turbo/Polygon Features"
 * of the OpenStreetMap wiki. `all` makes each value an area. `only` and `except` hold the values
 * that are areas, or the values that are not areas.
 */
export const OSM_AREA_RULES: Readonly<Record<string, "all" | { readonly only: readonly string[] } | { readonly except: readonly string[] }>> = {
  building: "all",
  "building:part": "all",
  landuse: "all",
  amenity: "all",
  leisure: "all",
  boundary: "all",
  place: "all",
  shop: "all",
  tourism: "all",
  historic: "all",
  public_transport: "all",
  office: "all",
  military: "all",
  ruins: "all",
  "area:highway": "all",
  craft: "all",
  golf: "all",
  indoor: "all",
  highway: { only: ["services", "rest_area", "escape", "elevator"] },
  natural: { except: ["coastline", "cliff", "ridge", "arete", "tree_row"] },
  waterway: { only: ["riverbank", "dock", "boatyard", "dam"] },
  barrier: { only: ["city_wall", "ditch", "hedge", "retaining_wall", "wall", "spikes"] },
  railway: { only: ["station", "turntable", "roundhouse", "platform"] },
  man_made: { except: ["cutline", "embankment", "pipeline"] },
  power: { only: ["plant", "substation", "generator", "transformer"] },
  aeroway: { except: ["taxiway"] },
};

/**
 * This function tells if a closed way with these tags is an area. The tag `area=yes` makes an
 * area, and `area=no` makes a line. Otherwise, `OSM_AREA_RULES` decides.
 */
export function isOsmArea(tags: Readonly<Record<string, string>>): boolean {
  if (tags["area"] === "yes") return true;
  if (tags["area"] === "no") return false;
  for (const [key, value] of Object.entries(tags)) {
    const rule = OSM_AREA_RULES[key];
    if (rule === undefined || value === "no") continue;
    if (rule === "all") return true;
    if ("only" in rule ? rule.only.includes(value) : !rule.except.includes(value)) return true;
  }
  return false;
}

/** This function gives the parts of a box: two parts when the box crosses the antimeridian, else the box. */
export function bboxParts(box: BBox): BBox[] {
  return box.west <= box.east ? [box] : [{ ...box, east: 180 }, { ...box, west: -180 }];
}

/** This function gives a text in quotes for Overpass QL. It refuses a control character. */
function qlString(text: string): string {
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new RangeError("A key or a value of a selector has a control character");
  return `"${text.replace(/[\\"]/g, "\\$&")}"`;
}

/** This function gives a number of a box for Overpass QL, with no exponent. `checkBox` refuses each value that is not on the map first. */
function qlNumber(value: number): string {
  return value.toFixed(7);
}

/** This function refuses a box that is not on the map, or that has its south north of its north. */
function checkBox(box: BBox): void {
  const { west, south, east, north } = box;
  const onMap = [west, east].every((lon) => lon >= -180 && lon <= 180) && [south, north].every((lat) => lat >= -90 && lat <= 90);
  if (!onMap || !(south <= north)) throw new RangeError("The box is not on the map, or its south is north of its north");
}

/**
 * This function gives the Overpass QL query of the elements that a selector selects in a box,
 * with their geometry (`out geom`). A box that crosses the antimeridian gives two parts.
 *
 * @throws RangeError when there is no selector, when the box is not on the map, or when a key or a value has a control character.
 */
export function overpassQuery(box: BBox, selectors: readonly OsmSelector[], timeoutSeconds = 60): string {
  if (selectors.length === 0) throw new RangeError("Give at least one selector");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1) throw new RangeError("The time limit is not a positive whole number of seconds");
  checkBox(box);
  const statements: string[] = [];
  for (const part of bboxParts(box)) {
    const area = `(${qlNumber(part.south)},${qlNumber(part.west)},${qlNumber(part.north)},${qlNumber(part.east)})`;
    for (const selector of selectors) {
      const values = [...new Set(selector.values ?? [])];
      const filter =
        values.length === 0
          ? `[${qlString(selector.key)}]`
          : values.length === 1
            ? `[${qlString(selector.key)}=${qlString(values[0]!)}]`
            : `[${qlString(selector.key)}~${qlString(`^(${values.map((value) => value.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&")).join("|")})$`)}]`;
      const kinds = new Set(selector.kinds ?? ["node", "way", "relation"]);
      for (const kind of kinds.size === 3 ? ["nwr"] : [...kinds]) statements.push(`${kind}${filter}${area};`);
    }
  }
  return `[out:json][timeout:${timeoutSeconds}];(${statements.join("")});out geom;`;
}

/**
 * This function gives the GET exchange of an Overpass query.
 *
 * @throws RangeError when the URL is longer than `MAX_URL_LENGTH`.
 */
export function overpassExchange(query: string, userAgent: string, baseUrl: string = OVERPASS_URL): Exchange {
  const url = new URL(baseUrl);
  url.searchParams.set("data", query);
  const text = url.toString();
  if (text.length > MAX_URL_LENGTH) throw new RangeError(`The query makes a URL of ${text.length} characters, more than ${MAX_URL_LENGTH}: give fewer selectors or values`);
  return { method: "GET", url: text, headers: { accept: "application/json", "user-agent": userAgent }, body: null };
}

/** This function tells if a value is an object that is not a list. */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function gives the tags of an element: only the tags with a text value. */
function tagsOf(element: Readonly<Record<string, unknown>>): Record<string, string> {
  const tags: Record<string, string> = {};
  if (isObject(element["tags"])) for (const [key, value] of Object.entries(element["tags"])) if (typeof value === "string") tags[key] = value;
  return tags;
}

/** This function gives the position of a point of Overpass, or undefined when it has no valid coordinates. */
function positionOf(point: unknown): Position | undefined {
  if (!isObject(point)) return undefined;
  const { lat, lon } = point;
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : undefined;
}

/** This function gives the line of a way of Overpass (`out geom`), or undefined when a point is absent. */
function lineOf(geometry: unknown): Position[] | undefined {
  if (!Array.isArray(geometry)) return undefined;
  const line: Position[] = [];
  for (const point of geometry) {
    const position = positionOf(point);
    if (position === undefined) return undefined;
    line.push(position);
  }
  return line;
}

const samePosition = (a: Position, b: Position): boolean => a[0] === b[0] && a[1] === b[1];
const isClosed = (line: readonly Position[]): boolean => line.length >= 4 && samePosition(line[0]!, line[line.length - 1]!);

/**
 * This function joins the lines of the members of a relation into closed rings. Two lines join
 * where they have the same end point. It also counts the lines that make no closed ring.
 */
export function joinRings(lines: readonly (readonly Position[])[]): { rings: Position[][]; open: number } {
  const pending = lines.filter((line) => line.length >= 2).map((line) => [...line]);
  const rings: Position[][] = [];
  let open = 0;
  while (pending.length > 0) {
    let ring = pending.shift()!;
    while (!samePosition(ring[0]!, ring[ring.length - 1]!)) {
      const end = ring[ring.length - 1]!;
      const index = pending.findIndex((line) => samePosition(line[0]!, end) || samePosition(line[line.length - 1]!, end));
      if (index < 0) break;
      const next = pending.splice(index, 1)[0]!;
      ring = ring.concat((samePosition(next[0]!, end) ? next : [...next].reverse()).slice(1));
    }
    if (isClosed(ring)) rings.push(ring);
    else open += 1;
  }
  return { rings, open };
}

/** This function gives the area of a multipolygon relation, or a reason when it has none. */
function areaOf(members: readonly Readonly<Record<string, unknown>>[]): { geometry?: Polygon | MultiPolygon; notes: string[] } {
  const outerLines: Position[][] = [];
  const innerLines: Position[][] = [];
  const notes: string[] = [];
  for (const member of members) {
    if (member["type"] !== "way") continue;
    const line = lineOf(member["geometry"]);
    if (line === undefined) {
      notes.push("a member way has no geometry");
      continue;
    }
    (member["role"] === "inner" ? innerLines : outerLines).push(line);
  }
  const outer = joinRings(outerLines);
  const inner = joinRings(innerLines);
  if (outer.open + inner.open > 0) notes.push(`member lines with no closed ring: ${outer.open + inner.open}`);
  if (outer.rings.length === 0) return { notes: [...notes, "it has no closed outer ring"] };
  const polygons: Position[][][] = outer.rings.map((ring) => [ring]);
  for (const ring of inner.rings) {
    const [lon, lat] = ring[0]!;
    const home = polygons.find((polygon) => locatePoint({ lat: lat!, lon: lon! }, { type: "Polygon", coordinates: [polygon[0]!] }) !== "outside");
    if (home === undefined) notes.push("an inner ring is outside each outer ring");
    else home.push(ring);
  }
  const geometry: Polygon | MultiPolygon = polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0]! } : { type: "MultiPolygon", coordinates: polygons };
  return { geometry: rewind(geometry), notes };
}

/** This function gives the geometry of one element of Overpass, or the reason when it has none. */
function geometryOf(
  element: Readonly<Record<string, unknown>>,
  tags: Readonly<Record<string, string>>,
  isArea: (tags: Readonly<Record<string, string>>) => boolean
): { geometry?: Geometry; notes: string[] } {
  if (element["type"] === "node") {
    const position = positionOf(element);
    return position === undefined ? { notes: ["it has no coordinates"] } : { geometry: { type: "Point", coordinates: position }, notes: [] };
  }
  if (element["type"] === "way") {
    const line = lineOf(element["geometry"]);
    if (line === undefined || line.length < 2) return { notes: ["it has no complete geometry (use out geom)"] };
    if (isClosed(line) && isArea(tags)) return { geometry: rewind({ type: "Polygon", coordinates: [line] }), notes: [] };
    return { geometry: { type: "LineString", coordinates: line }, notes: [] };
  }
  const members = Array.isArray(element["members"]) ? element["members"].filter(isObject) : [];
  if (tags["type"] === "multipolygon" || tags["type"] === "boundary") return areaOf(members);
  const lines = members.filter((member) => member["type"] === "way").map((member) => lineOf(member["geometry"]));
  const complete = lines.filter((line): line is Position[] => line !== undefined && line.length >= 2);
  if (complete.length === 0) return { notes: [`a relation of type ${tags["type"] ?? "unknown"} with no complete member way`] };
  const notes = complete.length < lines.length ? [`member ways with no complete geometry: ${lines.length - complete.length}`] : [];
  return { geometry: { type: "MultiLineString", coordinates: complete }, notes };
}

/** These options change `osmFeatures`. */
export interface OsmFeaturesOptions {
  /** This function tells if a closed way is an area. The default is `isOsmArea`. */
  readonly isArea?: ((tags: Readonly<Record<string, string>>) => boolean) | undefined;
}

/**
 * This function gives the GeoJSON features of an Overpass answer in JSON (`[out:json]` and
 * `out geom`). A node gives a point. A way gives a line, or a polygon when it is a closed area. A
 * multipolygon or a boundary relation gives a polygon or a multipolygon, and another relation
 * gives the lines of its ways. Each element with no geometry goes to `skipped`, with its reason.
 *
 * @throws Error when the answer is not an Overpass answer, or when it tells of a runtime error (for example a time-out).
 */
export function osmFeatures(answer: unknown, options: OsmFeaturesOptions = {}): OsmFeatures {
  if (!isObject(answer) || !Array.isArray(answer["elements"])) throw new Error("The answer is not an Overpass answer in JSON: it has no elements");
  const remark = answer["remark"];
  if (typeof remark === "string" && /runtime error/i.test(remark)) throw new Error(`Overpass stopped the query: ${remark.slice(0, 300)}`);
  const isArea = options.isArea ?? isOsmArea;
  const features: OsmFeature[] = [];
  const skipped: SkippedElement[] = [];
  for (const element of answer["elements"]) {
    if (!isObject(element)) continue;
    const id = `${String(element["type"])}/${String(element["id"])}`;
    const tags = tagsOf(element);
    const { geometry, notes } = geometryOf(element, tags, isArea);
    if (geometry === undefined) skipped.push({ id, reason: notes.join("; ") });
    else {
      features.push({ type: "Feature", id, geometry, properties: tags });
      if (notes.length > 0) skipped.push({ id, reason: `the feature is not complete: ${notes.join("; ")}` });
    }
  }
  const facts = isObject(answer["osm3s"]) ? answer["osm3s"] : {};
  const dataAt = typeof facts["timestamp_osm_base"] === "string" ? facts["timestamp_osm_base"] : undefined;
  const attribution = typeof facts["copyright"] === "string" ? facts["copyright"] : OSM_ATTRIBUTION;
  return { collection: { type: "FeatureCollection", features }, skipped, ...(dataAt !== undefined ? { dataAt } : {}), attribution };
}

/** The options of one page of an ArcGIS layer query. */
export interface ArcgisQuery {
  /** This value is the URL of the layer, for example `https://host/arcgis/rest/services/Name/FeatureServer/0`. */
  readonly layerUrl: string;
  readonly bbox: BBox;
  /** This value is the SQL condition of the query. The default is `1=1`, each feature. */
  readonly where?: string | undefined;
  /** These are the fields of each feature. The default is each field. */
  readonly outFields?: readonly string[] | undefined;
  /** This value is the number of features before this page. */
  readonly offset: number;
  /** This value is the largest number of features of the page. */
  readonly pageSize: number;
  readonly userAgent: string;
}

/** This function tells if a URL is the URL of an ArcGIS layer: a `FeatureServer` or a `MapServer` and the number of the layer. */
export function isArcgisLayerUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.search === "" && parsed.hash === "" && /\/(FeatureServer|MapServer)\/\d+\/?$/.test(parsed.pathname);
}

/**
 * This function gives the GET exchange of one page of features of an ArcGIS layer in a box, as
 * GeoJSON in WGS84 (`f=geojson`, `outSR=4326`). It gives one exchange for one box: give each part
 * of `bboxParts` to its own query.
 *
 * @throws RangeError when the URL is not the URL of a layer, when the box is not on the map or crosses the antimeridian, or when the page is not valid.
 */
export function arcgisExchange(query: ArcgisQuery): Exchange {
  if (!isArcgisLayerUrl(query.layerUrl)) throw new RangeError("The URL is not the URL of an ArcGIS layer (…/FeatureServer/<n> or …/MapServer/<n>)");
  checkBox(query.bbox);
  if (query.bbox.west > query.bbox.east) throw new RangeError("The box crosses the antimeridian: give each part of bboxParts to its own query");
  if (!Number.isInteger(query.offset) || query.offset < 0 || !Number.isInteger(query.pageSize) || query.pageSize < 1) throw new RangeError("The offset or the page size is not valid");
  const { west, south, east, north } = query.bbox;
  // The path ends with the number of the layer and at most one "/" (isArcgisLayerUrl)
  const url = new URL(query.layerUrl);
  url.pathname = `${url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname}/query`;
  const params: Record<string, string> = {
    where: query.where ?? "1=1",
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: query.outFields === undefined || query.outFields.length === 0 ? "*" : query.outFields.join(","),
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(query.offset),
    resultRecordCount: String(query.pageSize),
    f: "geojson",
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const text = url.toString();
  if (text.length > MAX_URL_LENGTH) throw new RangeError(`The query makes a URL of ${text.length} characters, more than ${MAX_URL_LENGTH}`);
  return { method: "GET", url: text, headers: { accept: "application/geo+json, application/json", "user-agent": query.userAgent }, body: null };
}

/**
 * This function gives the features of one page of an ArcGIS layer query (`f=geojson`), and tells
 * if the layer has more features (`exceededTransferLimit`).
 *
 * @throws Error when the answer is an ArcGIS error, or when it is not a GeoJSON feature collection.
 */
export function arcgisPage(answer: unknown): ArcgisPage {
  if (isObject(answer) && isObject(answer["error"])) {
    const error = answer["error"];
    throw new Error(`The ArcGIS layer refused the query: ${String(error["code"] ?? "no code")} ${String(error["message"] ?? "").slice(0, 300)}`.trim());
  }
  if (!isObject(answer) || answer["type"] !== "FeatureCollection" || !Array.isArray(answer["features"])) throw new Error("The answer is not a GeoJSON feature collection");
  const features: ArcgisFeature[] = [];
  for (const feature of answer["features"]) {
    if (!isObject(feature) || feature["type"] !== "Feature") throw new Error("The answer has an item that is not a GeoJSON feature");
    const { id, geometry, properties } = feature;
    const parsed = geometry === null || geometry === undefined ? undefined : parseGeometry(geometry);
    if (parsed?.tag === "err") throw new Error(`The answer has a feature with a geometry that is not valid: ${parsed.error.message}`);
    features.push({
      type: "Feature",
      ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
      geometry: parsed === undefined ? null : parsed.value,
      properties: isObject(properties) ? properties : null,
    });
  }
  const more = answer["exceededTransferLimit"] === true || (isObject(answer["properties"]) && answer["properties"]["exceededTransferLimit"] === true);
  return { features, more };
}
