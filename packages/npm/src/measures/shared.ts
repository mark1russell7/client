/**
 * The parts that each measure shares: the request, the result of an extractor, the fetch and the runner.
 *
 * A measure is a pure pair. Its request builder gives the URL and the `Accept` header, and its extractor reads the body
 * text of the response into typed rows. Neither function sends a request. The caller gives the fetch, so the same pair
 * works with `globalThis.fetch` and with the recipes of a crawler.
 */

/**
 * One request of a measure. Its fields fit the `RecipeRequest` of `polite-crawler` and the `init` of `fetch`.
 */
export interface MeasureRequest {
  readonly url: string;
  readonly accept: string;
}

/**
 * The result of an extractor. `rows` holds the values that the response gives. `missing` holds each package that the
 * source does not know.
 */
export interface Extracted<Row> {
  readonly rows: readonly Row[];
  readonly missing: readonly string[];
}

/**
 * An extractor reads the body text of one response. The URL of the request tells which packages the body answers for.
 * An extractor throws an error that names the URL when the body has a shape that it does not know.
 */
export type Extractor<Row> = (text: string, url: string) => Extracted<Row>;

/** A fetch that gives the body text of a response. `globalThis.fetch` fits this type. */
export type MeasureFetch = (
  url: string,
  init: { readonly headers: Readonly<Record<string, string>> },
) => Promise<{ readonly text: () => Promise<string> }>;

/**
 * This function sends one request of a measure through the given fetch and reads the response with the extractor. It
 * does not wait between requests. The caller keeps the pace of each source.
 */
export async function measure<Row>(fetch: MeasureFetch, request: MeasureRequest, extract: Extractor<Row>): Promise<Extracted<Row>> {
  const response = await fetch(request.url, { headers: { accept: request.accept } });
  return extract(await response.text(), request.url);
}

/** The `Accept` header of a JSON API. */
export const ACCEPT_JSON = "application/json";

/** The names that npm refuses for all packages, also for old packages. */
const EXCLUDED = new Set(["node_modules", "favicon.ico"]);

const SCOPED = /^@([^/]+)\/([^/]+)$/;

const urlSafe = (part: string): boolean => part !== "" && encodeURIComponent(part) === part;

/**
 * This function throws an error when the text cannot be the name of a package on npm. It applies the rules of npm for
 * existing packages, because old packages keep names that a new package cannot have. Thus capital letters and the
 * characters `~'!()*` are valid, for example `JSONStream`. Each part of the name is safe in a URL.
 */
export function assertExistingPackageName(name: string): void {
  const scoped = SCOPED.exec(name);
  const parts = scoped === null ? [name] : scoped.slice(1);
  const valid =
    name.length <= 214 &&
    !name.startsWith(".") &&
    !name.startsWith("_") &&
    !EXCLUDED.has(name.toLowerCase()) &&
    parts.every(urlSafe) &&
    // The name of a scoped package does not start with a period. Only a scoped name has a valid slash.
    !name.includes("/.");
  if (!valid) throw new Error(`"${name}" is not a valid npm package name.`);
}

/** This function gives the name of a package as one segment of a URL path: `@scope/name` becomes `@scope%2Fname`. */
export function nameSegment(name: string): string {
  assertExistingPackageName(name);
  return name.replaceAll("/", "%2F");
}

/** This function gives the error of a body with a shape that the extractor does not know. */
export function shapeError(url: string, what: string, text: string): Error {
  const start = text.length > 200 ? `${text.slice(0, 200)}...` : text;
  return new Error(`${url} answered a body that is not ${what}: ${start}`);
}

/** This function gives the path segments of a URL after a prefix, with each segment decoded. */
export function pathAfter(url: string, prefix: string): string[] {
  const path = new URL(url).pathname;
  if (!path.startsWith(prefix)) throw new Error(`${url} is not a URL of the form ${prefix}...`);
  return path
    .slice(prefix.length)
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => decodeURIComponent(segment));
}
