/**
 * The point of a street address of the United States, from the Census Geocoder of the U.S. Census Bureau.
 * The geocoder finds the address range of the street line that holds the house number (TIGER/Line).
 * Then it gives a point on that range, at the place of the number between the two ends.
 * So the point is on the street line, near the road. It is not in the lot, and a lot can be far from it.
 *
 * These functions make the request and read the answer. They use no network, so a browser bundle can use them.
 */
import type { Exchange } from "polite-crawler/api";

/** The host of the Census Geocoder. */
export const CENSUS_GEOCODER_HOST = "geocoding.geo.census.gov";

/** The endpoint of the Census Geocoder for one address in parts (a street, a city, a state and a ZIP code). */
export const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/address";

/** The benchmark of the address ranges that the geocoder reads: the current public ranges. */
export const CENSUS_BENCHMARK = "Public_AR_Current";

/** The citation of the data of the Census Geocoder. */
export const CENSUS_GEOCODER_ATTRIBUTION = "U.S. Census Bureau, Census Geocoder (TIGER/Line address ranges).";

/** This record is one address of the United States in parts. The street holds the house number and the street name. */
export interface CensusAddress {
  readonly street: string;
  readonly city?: string | undefined;
  /** The state, as a code (for example VT) or as a name. */
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
}

/** This record is one match of the geocoder: the point on the address range, and the address that the geocoder matched. */
export interface CensusMatch {
  readonly lat: number;
  readonly lon: number;
  readonly matchedAddress: string;
  /** The side of the street line that holds the number: `L` (left) or `R` (right), or `null` when the answer does not tell. */
  readonly side: "L" | "R" | null;
  /** The id of the TIGER/Line edge of the address range, or `null`. */
  readonly tigerLineId: string | null;
}

/** This function gives the GET exchange of the geocoder for one address. */
export function censusAddressExchange(address: CensusAddress, userAgent: string, benchmark: string = CENSUS_BENCHMARK, baseUrl: string = CENSUS_GEOCODER_URL): Exchange {
  const url = new URL(baseUrl);
  url.searchParams.set("street", address.street);
  if (address.city) url.searchParams.set("city", address.city);
  if (address.state) url.searchParams.set("state", address.state);
  if (address.zip) url.searchParams.set("zip", address.zip);
  url.searchParams.set("benchmark", benchmark);
  url.searchParams.set("format", "json");
  return { method: "GET", url: url.toString(), headers: { accept: "application/json", "user-agent": userAgent }, body: null };
}

/** This function tells if a value is an object that is not a list. */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * This function gives the matches of an answer of `censusAddressExchange`, in the order of the answer.
 * An empty list tells that the geocoder found no address range for the address. A match with no correct point is skipped.
 *
 * @throws Error when the answer is not an answer of the geocoder (it has no `result.addressMatches` list).
 */
export function censusMatches(answer: unknown): CensusMatch[] {
  const result = isObject(answer) ? answer["result"] : undefined;
  const matches = isObject(result) ? result["addressMatches"] : undefined;
  if (!Array.isArray(matches)) throw new Error("The Census Geocoder gave an answer with no list of address matches");
  const out: CensusMatch[] = [];
  for (const match of matches) {
    if (!isObject(match)) continue;
    const coordinates = match["coordinates"];
    const lon = isObject(coordinates) ? Number(coordinates["x"]) : Number.NaN;
    const lat = isObject(coordinates) ? Number(coordinates["y"]) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const line = match["tigerLine"];
    const side = isObject(line) ? line["side"] : undefined;
    const id = isObject(line) ? line["tigerLineId"] : undefined;
    out.push({
      lat,
      lon,
      matchedAddress: typeof match["matchedAddress"] === "string" ? match["matchedAddress"] : "",
      side: side === "L" || side === "R" ? side : null,
      tigerLineId: typeof id === "string" && id !== "" ? id : null,
    });
  }
  return out;
}
