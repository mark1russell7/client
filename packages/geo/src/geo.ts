/**
 * Places on a map: the coordinates of an address (OpenStreetMap Nominatim) and the time and
 * distance of a drive between two points (OSRM).
 */

import { InvocationError } from "@procedures/client/browser";

/** A point on the map, in degrees. */
export interface Point {
  readonly lat: number;
  readonly lon: number;
}

export interface GeocodeResult extends Point {
  readonly displayName: string;
}

export interface RouteResult {
  readonly km: number;
  readonly minutes: number;
  /** The points of the route, from the start to the destination. Only when the call asks for the line. */
  readonly line?: readonly Point[];
}

/** The detail of the line of a route: `full` gives each point of the road, `simplified` gives fewer points for a map at the zoom of the route. */
export type RouteLine = "full" | "simplified";

/** The public Nominatim server. Its policy: at most one request each second, and a User-Agent that names the application. */
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

/** The public OSRM demonstration server. It has a fair-use limit. A self-hosted OSRM has the same API. */
export const OSRM_URL = "https://router.project-osrm.org";

/**
 * The part of `fetch` that this package uses. A host or a test can give its own function, for
 * example a fetch with a cache or a recorder. The default is the global `fetch`.
 */
export type FetchJson = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** This function gets a JSON document, with a time limit and the signal of the call. */
export async function getJson(
  url: string,
  options: {
    timeoutMs: number;
    signal?: AbortSignal | undefined;
    headers?: Record<string, string>;
    fetch?: FetchJson | undefined;
  },
  service: string
): Promise<unknown> {
  const signals = [AbortSignal.timeout(options.timeoutMs), ...(options.signal ? [options.signal] : [])];
  const fetchJson: FetchJson = options.fetch ?? fetch;
  let response: Awaited<ReturnType<FetchJson>>;
  try {
    response = await fetchJson(url, { signal: AbortSignal.any(signals), headers: { accept: "application/json", ...options.headers } });
  } catch (error) {
    // A refusal (the host policy of a `fetch` of `createHostFetch()`) keeps its code and its reason
    if (error instanceof InvocationError && error.code === "FORBIDDEN") throw error;
    const reason = (error as { name?: string }).name === "TimeoutError" ? `no answer in ${options.timeoutMs} ms` : "the request failed";
    throw new Error(`${service} did not answer: ${reason}`, { cause: error });
  }
  if (!response.ok) throw new Error(`${service} gave HTTP ${response.status}`);
  return response.json();
}

/**
 * This function gives the coordinates of an address or a place name, or undefined when Nominatim
 * finds nothing. A caller that geocodes many places must wait one second between calls.
 */
export async function geocode(
  query: string,
  options: {
    userAgent: string;
    countryCodes?: string | undefined;
    baseUrl?: string | undefined;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
    fetch?: FetchJson | undefined;
  }
): Promise<GeocodeResult | undefined> {
  const params = new URLSearchParams({ format: "jsonv2", limit: "1", q: query });
  if (options.countryCodes !== undefined) params.set("countrycodes", options.countryCodes);
  const rows = (await getJson(
    `${options.baseUrl ?? NOMINATIM_URL}/search?${params.toString()}`,
    { timeoutMs: options.timeoutMs, signal: options.signal, headers: { "user-agent": options.userAgent }, fetch: options.fetch },
    "Nominatim"
  )) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const first = Array.isArray(rows) ? rows[0] : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (first === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return { lat, lon, displayName: first.display_name ?? query };
}

/**
 * This function gives the time and the distance of a drive from one point to another.
 * With the option `line`, it also gives the points of the route, for example to find the bridges on it.
 */
export async function drivingRoute(
  from: Point,
  to: Point,
  options: {
    baseUrl?: string | undefined;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
    fetch?: FetchJson | undefined;
    line?: RouteLine | undefined;
  }
): Promise<RouteResult> {
  const overview = options.line === undefined ? "overview=false" : `overview=${options.line}&geometries=geojson`;
  const body = (await getJson(
    `${options.baseUrl ?? OSRM_URL}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?${overview}`,
    { timeoutMs: options.timeoutMs, signal: options.signal, fetch: options.fetch },
    "OSRM"
  )) as { code?: string; routes?: Array<{ duration?: number; distance?: number; geometry?: { coordinates?: unknown } }> };
  const route = body.routes?.[0];
  if (body.code !== "Ok" || route?.duration === undefined || route.distance === undefined) {
    throw new Error(`OSRM found no route (${body.code ?? "no code"})`);
  }
  const result = {
    km: Math.round((route.distance / 1000) * 10) / 10,
    minutes: Math.max(1, Math.round(route.duration / 60)),
  };
  if (options.line === undefined) return result;
  const line = routeLine(route.geometry?.coordinates);
  if (line === undefined) throw new Error("OSRM gave no line for the route");
  return { ...result, line };
}

/** This function reads the GeoJSON positions of a route line, or gives `undefined` when a position is not two finite numbers. */
function routeLine(coordinates: unknown): Point[] | undefined {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return undefined;
  const line: Point[] = [];
  for (const position of coordinates) {
    if (!Array.isArray(position)) return undefined;
    const [lon, lat] = position as unknown[];
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
    line.push({ lat, lon });
  }
  return line;
}
