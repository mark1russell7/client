/**
 * The data of the site. `scripts/gen-data.mjs` generates it from the workspace before each build.
 */

import catalogJson from "./generated/catalog.js";
import packagesJson from "./generated/packages.js";

/** An input field of a core procedure, read from its TypeScript input type. */
export interface Field {
  name: string;
  type: string;
  optional: boolean;
}

/** One procedure of the registry. */
export interface ProcedureInfo {
  key: string;
  path: string[];
  /** The folder of the package that defines the procedure. */
  package: string;
  description: string;
  tags: string[];
  input: JsonSchema;
  output: JsonSchema;
  /** The procedure is in the registry by default (the servers can call it). */
  registered: boolean;
  /** The `mark` CLI has the procedure as a command: its package declares `client.procedures`. */
  cli: boolean;
  /** The procedure runs in the browser: the Composer can use it. */
  browser: boolean;
  /** The dev-tools MCP server gives the procedure to Claude as a tool. */
  mcp: boolean;
  fields: Field[] | null;
}

/** One package of the workspace. */
export interface PackageInfo {
  dir: string;
  name: string;
  description: string;
  private: boolean;
  /** The folders of the workspace packages that this package uses. */
  deps: string[];
  /** The lines of TypeScript source, without the tests. */
  lines: number;
  procedures: number;
  /** 0 for a package without workspace dependencies, else 1 + the highest level of its dependencies. */
  level: number;
}

/** A JSON Schema, as the MCP layer makes it from a procedure schema. */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

/** A package that did not load when `gen-data` made the catalog. */
export interface LoadFailure {
  package: string;
  error: string;
}

/** The commit and the time of the build that made the data. */
export interface BuildInfo {
  commit: string | null;
  date: string | null;
}

/** The measured numbers of the home page (`scripts/site-metrics.mjs`). */
export interface SiteMetrics {
  /** The tests (`it`/`test` calls) in the test files of the packages. */
  tests: number;
  testFiles: number;
  /** The library on npm: the latest version, or null when it is not published. */
  npm: { name: string; version: string | null };
  /** The newest version of the changelogs (`scripts/releases-data.mjs`), or null. The build can run before npm has it. */
  release?: { version: string; date: string } | null;
}

interface Catalog {
  procedures: ProcedureInfo[];
  mcpTools: string[];
  failed: LoadFailure[];
  build: BuildInfo;
  metrics?: SiteMetrics;
}

const catalog = catalogJson as unknown as Catalog;

export const procedures: ProcedureInfo[] = catalog.procedures;
export const packages: PackageInfo[] = packagesJson as unknown as PackageInfo[];
export const mcpTools: string[] = catalog.mcpTools;
export const failedPackages: LoadFailure[] = catalog.failed ?? [];
export const build: BuildInfo = catalog.build ?? { commit: null, date: null };
export const metrics: SiteMetrics = catalog.metrics ?? { tests: 0, testFiles: 0, npm: { name: "@procedures/client", version: null } };

const byKey = new Map(procedures.map((procedure) => [procedure.key, procedure]));

/** This function gives the procedure at a key ("client.add"), or undefined. */
export function procedureByKey(key: string): ProcedureInfo | undefined {
  return byKey.get(key);
}

// ---------------------------------------------------------------------------
// The status board (`scripts/status-data.mjs` reads the status documents)
// ---------------------------------------------------------------------------

export type FindingStatus = "open" | "decision" | "partly" | "fixed" | "done";
export type Severity = "critical" | "high" | "medium" | "low";

/** A commit that a status document names, with its page on GitHub. */
export interface CommitLink {
  hash: string;
  /** The repository: "client" for this one, or a general repository ("cue", "docker-sqlite"). */
  repo: string;
  url: string;
}

/** A row of a table of the deep-dive status. The text fields are inline Markdown. */
export interface Finding {
  /** The ID cell, for example "WRP-1 / MCP-2". */
  id: string;
  /** The IDs in the cell, for the search. */
  ids: string[];
  area: string;
  /** The highest severity that the cell names, or null. */
  severity: Severity | null;
  severityText: string;
  status: FindingStatus;
  note: string;
  commits: CommitLink[];
}

export interface StatusArea {
  slug: string;
  label: string;
  /** The section title of the status document. */
  title: string;
}

/** An item of the architecture roadmap: "0.1 Lock down the warm server". */
export interface RoadmapItem {
  item: string;
  phase: number | null;
  status: FindingStatus;
  note: string;
  commits: CommitLink[];
}

/** The status of the July register (BUGS-STATUS-2026-10.md). */
export interface JulyRegister {
  summary: Array<{ status: string; count: number; ids: string }>;
  fixes: Array<{ ids: string; fix: string; commits: CommitLink[] }>;
  found: Array<{ defect: string; commits: CommitLink[] }>;
}

export interface StatusData {
  areas: StatusArea[];
  findings: Finding[];
  roadmap: RoadmapItem[];
  july: JulyRegister;
  /** The paths of the documents in the repository. */
  sources: { deepDive: string; july: string };
}


// ---------------------------------------------------------------------------
// The releases (`scripts/releases-data.mjs` reads the changelogs)
// ---------------------------------------------------------------------------

/** "first" for the first release, "minor" when the PATCH number is 0, else "patch". */
export type ReleaseKind = "first" | "minor" | "patch";

/** One change of a release: one commit, and the packages whose changelogs list it. */
export interface ReleaseChange {
  /** The short SHA of the commit, or null for an entry without a commit. */
  commit: string | null;
  /** The first sentence of the changelog entry, as inline Markdown. */
  text: string;
  /** The npm names of the packages, sorted. */
  packages: string[];
}

/** One version of the group. */
export interface Release {
  version: string;
  /** The ISO date of the git tag, or of the commit that added the version to the changelog. */
  date: string;
  kind: ReleaseKind;
  /** The changes, the change with the most packages first. */
  changes: ReleaseChange[];
}

export interface ReleasesData {
  /** The package that names the group: "@procedures/client". */
  group: string;
  /** The versions, newest first. */
  releases: Release[];
}

/** The category of a core procedure, from its tags: "control-flow", "math", "string" and so on. */
export function categoryOf(procedure: ProcedureInfo): string {
  return procedure.tags.find((tag) => tag !== "core") ?? procedure.path[0] ?? "other";
}
