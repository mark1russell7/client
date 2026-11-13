/**
 * The hits of a package on the jsDelivr CDN, from the jsDelivr data API (`data.jsdelivr.com`).
 *
 * A hit is one request of a file of the package to the CDN. Many pages load a browser client from a CDN, not from a
 * bundle. The hits measure this use, and the npm downloads do not count it.
 */
import { isPlainObject, parseJsonOrUndefined } from "@procedures/json";
import { ACCEPT_JSON, type Extracted, type MeasureRequest, assertExistingPackageName, pathAfter, shapeError } from "./shared.js";

/** A period of the jsDelivr data API. Each period ends on the last full day. */
export type JsdelivrPeriod = "day" | "week" | "month" | "quarter" | "year";

/**
 * The hits of one package in one period. `rank` is the place of the package among all packages of jsDelivr, and
 * `typeRank` is its place among the npm packages. Each rank is `null` when the package has no hits.
 */
export interface JsdelivrHits {
  readonly package: string;
  readonly period: JsdelivrPeriod;
  readonly start: string | null;
  readonly end: string | null;
  readonly hits: number;
  readonly rank: number | null;
  readonly typeRank: number | null;
  /** The hits of the period before this period. */
  readonly previousHits: number | null;
}

const PREFIX = "/v1/stats/packages/npm/";
const PERIODS: readonly JsdelivrPeriod[] = ["day", "week", "month", "quarter", "year"];

/** This function gives the request for the hits of a package in one period. */
export function jsdelivrHitsRequest(name: string, period: JsdelivrPeriod = "month"): MeasureRequest {
  assertExistingPackageName(name);
  if (!PERIODS.includes(period)) throw new Error(`"${period}" is not a period of the jsDelivr data API.`);
  return { url: `https://data.jsdelivr.com${PREFIX}${name}?period=${period}`, accept: ACCEPT_JSON };
}

const rankOf = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);

/**
 * This function reads the response of `jsdelivrHitsRequest`. jsDelivr gives 0 hits and no rank for a package that it
 * does not know. Thus `missing` is always empty.
 */
export function extractJsdelivrHits(text: string, url: string): Extracted<JsdelivrHits> {
  const name = pathAfter(url, PREFIX).join("/");
  const period = new URL(url).searchParams.get("period") as JsdelivrPeriod | null;
  if (period === null || !PERIODS.includes(period)) throw new Error(`${url} names no period of the jsDelivr data API.`);
  const body = parseJsonOrUndefined(text);
  const hits = isPlainObject(body) ? body["hits"] : undefined;
  if (!isPlainObject(hits) || !Number.isInteger(hits["total"])) throw shapeError(url, "jsDelivr hits", text);
  const days = isPlainObject(hits["dates"]) ? Object.keys(hits["dates"]).sort() : [];
  const previous = hits["prev"];
  return {
    rows: [
      {
        package: name,
        period,
        start: days[0] ?? null,
        end: days.at(-1) ?? null,
        hits: hits["total"] as number,
        rank: rankOf(hits["rank"]),
        typeRank: rankOf(hits["typeRank"]),
        previousHits: isPlainObject(previous) && Number.isInteger(previous["total"]) ? (previous["total"] as number) : null,
      },
    ],
    missing: [],
  };
}
