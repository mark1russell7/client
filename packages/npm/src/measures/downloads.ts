/**
 * The downloads of a package from the npm downloads API (`api.npmjs.org`).
 *
 * The count includes each install that comes through another package, so it includes transitive use. A bulk request
 * gives the counts of up to 128 packages without a scope. A package with a scope needs a request of its own.
 */
import { ACCEPT_JSON, type Extracted, type MeasureRequest, assertPackageName, isRecord, jsonOrUndefined, pathAfter, shapeError } from "./shared.js";

/** The most packages of one bulk request of the npm downloads API. */
export const DOWNLOADS_BULK_LIMIT = 128;

/** A period of the npm downloads API: a named period, or two days `YYYY-MM-DD:YYYY-MM-DD`. */
export type DownloadsPeriod = "last-day" | "last-week" | "last-month" | `${string}:${string}`;

/** The downloads of one package in one period. The days are the first and the last day of the period. */
export interface DownloadsRow {
  readonly package: string;
  readonly start: string;
  readonly end: string;
  readonly downloads: number;
}

const PREFIX = "/downloads/point/";
const PERIOD = /^(?:last-day|last-week|last-month|\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2})$/;

/**
 * This function gives the requests for the downloads of the packages in one period. Each package goes into one
 * request: the packages without a scope go into bulk requests, and each package with a scope gets its own request.
 */
export function downloadsRequests(packages: readonly string[], period: DownloadsPeriod = "last-week"): MeasureRequest[] {
  if (!PERIOD.test(period)) throw new Error(`"${period}" is not a period of the npm downloads API.`);
  const unique = [...new Set(packages)];
  unique.forEach(assertPackageName);
  const base = `https://api.npmjs.org${PREFIX}${period}/`;
  const plain = unique.filter((name) => !name.startsWith("@"));
  const requests: MeasureRequest[] = [];
  for (let i = 0; i < plain.length; i += DOWNLOADS_BULK_LIMIT) {
    requests.push({ url: base + plain.slice(i, i + DOWNLOADS_BULK_LIMIT).join(","), accept: ACCEPT_JSON });
  }
  for (const name of unique.filter((n) => n.startsWith("@"))) requests.push({ url: base + name, accept: ACCEPT_JSON });
  return requests;
}

function row(url: string, value: unknown, text: string): DownloadsRow {
  if (!isRecord(value) || typeof value["package"] !== "string" || typeof value["start"] !== "string" || typeof value["end"] !== "string" || !Number.isInteger(value["downloads"])) {
    throw shapeError(url, "a count of downloads", text);
  }
  return { package: value["package"], start: value["start"], end: value["end"], downloads: value["downloads"] as number };
}

/**
 * This function reads the response of a request of `downloadsRequests`. A package that the registry does not know is
 * in `missing`. An error of another kind, for example a rate limit, throws an error.
 */
export function extractDownloads(text: string, url: string): Extracted<DownloadsRow> {
  const [, ...rest] = pathAfter(url, PREFIX);
  const joined = rest.join("/");
  const names = joined.startsWith("@") ? [joined] : joined.split(",");
  const body = jsonOrUndefined(text);
  if (!isRecord(body)) throw shapeError(url, "a JSON object", text);
  const error = body["error"];
  if (typeof error === "string") {
    if (names.length === 1 && /not found/i.test(error)) return { rows: [], missing: names };
    throw new Error(`${url} answered the error "${error}".`);
  }
  if ("downloads" in body) return { rows: [row(url, body, text)], missing: [] };
  const rows: DownloadsRow[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const value = body[name];
    if (value === null || value === undefined) missing.push(name);
    else rows.push(row(url, value, text));
  }
  return { rows, missing };
}
