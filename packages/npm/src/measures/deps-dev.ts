/**
 * The versions and the dependents of a package from the deps.dev API (`api.deps.dev`).
 *
 * The dependents of a version are the packages that depend on it. deps.dev counts the direct and the indirect
 * dependents. Thus the count includes transitive use. The dependents need a version, and the package request
 * gives the default version.
 */
import { ACCEPT_JSON, type Extracted, type MeasureRequest, assertPackageName, isRecord, jsonOrUndefined, pathAfter, shapeError } from "./shared.js";

/** One version of a package, as deps.dev knows it. */
export interface DepsDevVersion {
  readonly version: string;
  readonly publishedAt: string | null;
  readonly isDefault: boolean;
  /** The reason of the deprecation of the version, or `null` when the version is not deprecated. */
  readonly deprecated: string | null;
}

/** A package as deps.dev knows it. The default version is the version of the tag `latest`. */
export interface DepsDevPackage {
  readonly package: string;
  readonly defaultVersion: string | null;
  readonly versions: readonly DepsDevVersion[];
}

/** The dependents of one version of a package. `dependents` is the sum of the direct and the indirect dependents. */
export interface DepsDevDependents {
  readonly package: string;
  readonly version: string;
  readonly dependents: number;
  readonly direct: number;
  readonly indirect: number;
}

const PACKAGE_PREFIX = "/v3/systems/npm/packages/";
const DEPENDENTS_PREFIX = "/v3alpha/systems/npm/packages/";

/** This function gives the request for the versions of a package. */
export function depsDevPackageRequest(name: string): MeasureRequest {
  assertPackageName(name);
  return { url: `https://api.deps.dev${PACKAGE_PREFIX}${encodeURIComponent(name)}`, accept: ACCEPT_JSON };
}

/** This function gives the request for the dependents of one version of a package. */
export function depsDevDependentsRequest(name: string, version: string): MeasureRequest {
  assertPackageName(name);
  if (version.trim() === "") throw new Error("The version of a dependents request is empty.");
  return { url: `https://api.deps.dev${DEPENDENTS_PREFIX}${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:dependents`, accept: ACCEPT_JSON };
}

/** This function reads the response of `depsDevPackageRequest`. A package that deps.dev does not know is in `missing`. */
export function extractDepsDevPackage(text: string, url: string): Extracted<DepsDevPackage> {
  const [name] = pathAfter(url, PACKAGE_PREFIX);
  if (name === undefined) throw new Error(`${url} names no package.`);
  if (text.trim() === "package not found") return { rows: [], missing: [name] };
  const body = jsonOrUndefined(text);
  const versions = isRecord(body) ? body["versions"] : undefined;
  if (!Array.isArray(versions)) throw shapeError(url, "a deps.dev package", text);
  const rows: DepsDevVersion[] = versions.map((entry: unknown) => {
    const key = isRecord(entry) ? entry["versionKey"] : undefined;
    const version = isRecord(key) ? key["version"] : undefined;
    if (!isRecord(entry) || typeof version !== "string") throw shapeError(url, "a deps.dev package", text);
    const published = entry["publishedAt"];
    const reason = entry["deprecatedReason"];
    return {
      version,
      publishedAt: typeof published === "string" && published !== "" ? published : null,
      isDefault: entry["isDefault"] === true,
      deprecated: entry["isDeprecated"] === true ? (typeof reason === "string" ? reason : "") : null,
    };
  });
  const found = rows.find((v) => v.isDefault);
  return { rows: [{ package: name, defaultVersion: found === undefined ? null : found.version, versions: rows }], missing: [] };
}

/**
 * This function reads the response of `depsDevDependentsRequest`. A version that deps.dev does not know is in
 * `missing`, as `name@version`.
 */
export function extractDepsDevDependents(text: string, url: string): Extracted<DepsDevDependents> {
  const [name, , last] = pathAfter(url, DEPENDENTS_PREFIX);
  const version = last?.replace(/:dependents$/, "");
  if (name === undefined || version === undefined) throw new Error(`${url} names no package version.`);
  if (text.trim() === "dependents not found") return { rows: [], missing: [`${name}@${version}`] };
  const body = jsonOrUndefined(text);
  if (!isRecord(body)) throw shapeError(url, "a deps.dev count of dependents", text);
  const count = (field: string): number => {
    const value = body[field] ?? 0;
    if (!Number.isInteger(value)) throw shapeError(url, "a deps.dev count of dependents", text);
    return value as number;
  };
  return {
    rows: [{ package: name, version, dependents: count("dependentCount"), direct: count("directDependentCount"), indirect: count("indirectDependentCount") }],
    missing: [],
  };
}
