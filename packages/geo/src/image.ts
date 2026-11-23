/**
 * The values of an ArcGIS image service at points, for example the elevation of the USGS 3D Elevation Program (3DEP).
 * The operation is `getSamples` of an `ImageServer`. The request builder and the extractor are pure functions.
 */

import type { Exchange } from "polite-crawler/api";
import { MAX_URL_LENGTH } from "./features.js";

/** The image service of the USGS 3DEP elevation: the best elevation at each point, in meters above the vertical datum NAVD88. */
export const ELEVATION_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer";

/** The citation of the 3DEP elevation. The data is a work of the US government, in the public domain. */
export const ELEVATION_ATTRIBUTION = "U.S. Geological Survey, 3D Elevation Program (3DEP).";

/** The ways that an image service gives a value between the cells of the image. */
export type ImageInterpolation = "nearest" | "bilinear";

const INTERPOLATIONS: Readonly<Record<ImageInterpolation, string>> = { nearest: "RSP_NearestNeighbor", bilinear: "RSP_BilinearInterpolation" };

/** One point of a sample request: a longitude and a latitude in WGS84. */
export interface ImagePoint {
  readonly lon: number;
  readonly lat: number;
}

/** The value of an image service at one point of the request. */
export interface ImageSample {
  readonly lon: number;
  readonly lat: number;
  /** This value is the value of the image at the point, or null when the image has no data there. */
  readonly value: number | null;
  /** This value is the size of a cell of the image that gave the value, in the units of the service, or null. */
  readonly resolution: number | null;
}

/** These options change `imageSamplesExchange`. */
export interface ImageSamplesOptions {
  /** This value is the URL of the image service. The default is `ELEVATION_URL`. */
  readonly serviceUrl?: string;
  /** This value is the way to give a value between the cells. The default is `bilinear`. */
  readonly interpolation?: ImageInterpolation;
}

/** This function tells if a URL is the URL of an ArcGIS image service: a path that ends with `ImageServer`. */
export function isArcgisImageUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.search === "" && parsed.hash === "" && /\/ImageServer\/?$/.test(parsed.pathname);
}

/**
 * This function gives the GET exchange of the values of an image service at points. Each point
 * goes into the request only as two numbers with 6 decimals. The answer gives one value for each point.
 *
 * @throws RangeError when there is no point, or when a point is not on the map.
 * @throws RangeError when the URL is not the URL of an image service, or when the URL is longer than `MAX_URL_LENGTH`.
 */
export function imageSamplesExchange(points: readonly ImagePoint[], userAgent: string, options: ImageSamplesOptions = {}): Exchange {
  const serviceUrl = options.serviceUrl ?? ELEVATION_URL;
  if (!isArcgisImageUrl(serviceUrl)) throw new RangeError("The URL is not the URL of an ArcGIS image service (…/ImageServer)");
  if (points.length === 0) throw new RangeError("Give one point or more");
  for (const { lon, lat } of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new RangeError("A point is not on the map: give a longitude from -180 to 180 and a latitude from -90 to 90");
    }
  }
  const url = new URL(serviceUrl);
  url.pathname = `${url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname}/getSamples`;
  const coordinates = points.map(({ lon, lat }) => `[${lon.toFixed(6)},${lat.toFixed(6)}]`).join(",");
  const params: Record<string, string> = {
    geometry: `{"points":[${coordinates}],"spatialReference":{"wkid":4326}}`,
    geometryType: "esriGeometryMultipoint",
    returnFirstValueOnly: "true",
    interpolation: INTERPOLATIONS[options.interpolation ?? "bilinear"],
    f: "json",
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const text = url.toString();
  if (text.length > MAX_URL_LENGTH) throw new RangeError(`The points make a URL of ${text.length} characters, more than ${MAX_URL_LENGTH}: send fewer points in each request`);
  return { method: "GET", url: text, headers: { accept: "application/json", "user-agent": userAgent }, body: null };
}

/** This function tells if a value is an object that is not a list. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function gives the number in a field, or null when the field is empty, `NoData` or not a number. */
function numberOf(field: unknown): number | null {
  if (typeof field === "number") return Number.isFinite(field) ? field : null;
  if (typeof field !== "string" || field.trim() === "") return null;
  const value = Number(field);
  return Number.isFinite(value) ? value : null;
}

/**
 * This function gives the value of the image at each point of the request, in the order of the
 * points, from the answer of `imageSamplesExchange`. A point that the answer does not give has the value null.
 *
 * @throws Error when the answer is an ArcGIS error, or when it has no list of samples.
 */
export function imageSamples(answer: unknown, points: readonly ImagePoint[]): ImageSample[] {
  if (isObject(answer) && isObject(answer["error"])) {
    const error = answer["error"];
    throw new Error(`The image service refused the request: ${String(error["code"] ?? "no code")} ${String(error["message"] ?? "").slice(0, 300)}`.trim());
  }
  if (!isObject(answer) || !Array.isArray(answer["samples"])) throw new Error("The answer of the image service has no list of samples");
  const byLocation = new Map<number, { value: number | null; resolution: number | null }>();
  for (const sample of answer["samples"]) {
    if (!isObject(sample)) throw new Error("The answer of the image service has a sample that is not an object");
    const id = sample["locationId"];
    // With returnFirstValueOnly, the service gives one sample for each point. Keep the first.
    if (typeof id === "number" && Number.isInteger(id) && !byLocation.has(id)) byLocation.set(id, { value: numberOf(sample["value"]), resolution: numberOf(sample["resolution"]) });
  }
  return points.map(({ lon, lat }, index) => ({ lon, lat, value: byLocation.get(index)?.value ?? null, resolution: byLocation.get(index)?.resolution ?? null }));
}
