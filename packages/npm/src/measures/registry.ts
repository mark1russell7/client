/**
 * The facts of a package from the npm registry (`registry.npmjs.org`), as plain HTTP reads. The procedures
 * `npm.view` and `npm.distTags.list` read the same data through the npm CLI.
 *
 * - The version document of a tag gives the version, its deprecation, its repository and its license.
 * - The abbreviated document gives the tags, the count of versions and the time of the last change.
 */
import { isPlainObject, parseJsonOrUndefined } from "@procedures/json";
import { type Extracted, type MeasureRequest, nameSegment, pathAfter, shapeError } from "./shared.js";

/** The `Accept` header of the abbreviated document of a package. */
export const ACCEPT_ABBREVIATED = "application/vnd.npm.install-v1+json";

/** The version that a tag of a package names, with the facts of that version. */
export interface RegistryVersion {
  readonly package: string;
  readonly version: string;
  /** The message of the deprecation, or `null` when the version is not deprecated. */
  readonly deprecated: string | null;
  /** The URL of the repository as the package states it, or `null`. The function does not change its form. */
  readonly repository: string | null;
  /** The folder of the package in its repository, for a package of a monorepo. */
  readonly repositoryDirectory: string | null;
  readonly license: string | null;
}

/** The facts of the abbreviated document of a package. */
export interface RegistryDocument {
  readonly package: string;
  /**
   * The time of the last change of the document. A release changes it. A deprecation or a change of a tag changes it
   * too, so it is not the time of the last release.
   */
  readonly modified: string | null;
  readonly distTags: Readonly<Record<string, string>>;
  readonly versions: number;
  /** The message of the deprecation of the version of the tag `latest`, or `null`. */
  readonly latestDeprecated: string | null;
}

/** This function gives the request for the version document of a tag of a package. */
export function registryVersionRequest(name: string, tag = "latest"): MeasureRequest {
  if (tag.trim() === "") throw new Error("The tag of a version request is empty.");
  return { url: `https://registry.npmjs.org/${nameSegment(name)}/${encodeURIComponent(tag)}`, accept: "application/json" };
}

/** This function gives the request for the abbreviated document of a package. */
export function registryDocumentRequest(name: string): MeasureRequest {
  return { url: `https://registry.npmjs.org/${nameSegment(name)}`, accept: ACCEPT_ABBREVIATED };
}

/** This function gives the name of a package from the path segments of a registry URL. */
function nameOf(segments: readonly string[]): { name: string; rest: readonly string[] } {
  const [first, ...rest] = segments.flatMap((segment) => segment.split("/"));
  if (first === undefined) throw new Error("The URL names no package.");
  if (first.startsWith("@")) {
    const [second, ...more] = rest;
    if (second === undefined) throw new Error(`The URL names the scope ${first} and no package.`);
    return { name: `${first}/${second}`, rest: more };
  }
  return { name: first, rest };
}

const textOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * This function reads the response of `registryVersionRequest`. A package or a tag that the registry does not know is
 * in `missing`.
 */
export function extractRegistryVersion(text: string, url: string): Extracted<RegistryVersion> {
  const { name } = nameOf(pathAfter(url, "/"));
  const json = parseJsonOrUndefined(text);
  if (typeof json === "string" && /not found/i.test(json)) return { rows: [], missing: [name] };
  if (!isPlainObject(json) || typeof json["version"] !== "string") throw shapeError(url, "an npm version document", text);
  const repo = json["repository"];
  const license = json["license"];
  return {
    rows: [
      {
        package: name,
        version: json["version"],
        deprecated: typeof json["deprecated"] === "string" ? json["deprecated"] : null,
        repository: isPlainObject(repo) ? textOf(repo["url"]) : textOf(repo),
        repositoryDirectory: isPlainObject(repo) ? textOf(repo["directory"]) : null,
        license: isPlainObject(license) ? textOf(license["type"]) : textOf(license),
      },
    ],
    missing: [],
  };
}

/** This function reads the response of `registryDocumentRequest`. A package that the registry does not know is in `missing`. */
export function extractRegistryDocument(text: string, url: string): Extracted<RegistryDocument> {
  const { name } = nameOf(pathAfter(url, "/"));
  const json = parseJsonOrUndefined(text);
  if (isPlainObject(json) && typeof json["error"] === "string" && /not found/i.test(json["error"])) return { rows: [], missing: [name] };
  if (!isPlainObject(json) || !isPlainObject(json["versions"]) || !isPlainObject(json["dist-tags"])) throw shapeError(url, "an abbreviated npm document", text);
  const tags: Record<string, string> = {};
  for (const [tag, version] of Object.entries(json["dist-tags"])) if (typeof version === "string") tags[tag] = version;
  const latest = tags["latest"] === undefined ? undefined : json["versions"][tags["latest"]];
  return {
    rows: [
      {
        package: name,
        modified: textOf(json["modified"]),
        distTags: tags,
        versions: Object.keys(json["versions"]).length,
        latestDeprecated: isPlainObject(latest) && typeof latest["deprecated"] === "string" ? latest["deprecated"] : null,
      },
    ],
    missing: [],
  };
}
