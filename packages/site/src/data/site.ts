/**
 * This module has the facts of the build that each page shows. These facts are the commit, the
 * packages that did not load, the measured numbers, the counts and the examples of the home page.
 * `scripts/gen-data.ts` writes them in a small module, so the main bundle does not hold the catalog.
 *
 * The catalog grows with each library that becomes procedures (direction 40). Thus only the pages
 * that show procedures or packages load it (refer to `index.ts`). The plugin of
 * `build-time/start-chunks-plugin.ts` stops the build when a start chunk holds the catalog.
 */

import siteJson from "./generated/site.js";

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

/** The measured numbers of the home page (`scripts/site-metrics.ts`). */
export interface SiteMetrics {
  /** The tests (`it`/`test` calls) in the test files of the packages. */
  tests: number;
  testFiles: number;
  /** The library on npm: the latest version, or null when it is not published. */
  npm: { name: string; version: string | null };
  /** The newest version of the changelogs (`scripts/releases-data.ts`), or null. The build can run before npm has it. */
  release?: { version: string; date: string } | null;
}

/** The counts of the catalog, for the titles and the numbers of the pages. */
export interface SiteCounts {
  procedures: number;
  packages: number;
  /** The procedures that the dev-tools MCP server gives to Claude as tools. */
  mcpTools: number;
  /** The lines of TypeScript source of all packages, without the tests. */
  lines: number;
}

/**
 * The examples of the home page. They come from the catalog, so they stay true (deep dive
 * SITE-13: the page said that MCP gives git.status, but git.* is not a tool).
 */
export interface SiteExamples {
  /** The path of a procedure that the `mark` CLI has as a command, or null. */
  cli: string[] | null;
  /** The key of a procedure that is an MCP tool, or "". */
  mcp: string;
}

interface SiteData {
  build?: BuildInfo;
  failed?: LoadFailure[];
  metrics?: SiteMetrics;
  counts: SiteCounts;
  examples: SiteExamples;
}

const site = siteJson as unknown as SiteData;

export const failedPackages: LoadFailure[] = site.failed ?? [];
export const build: BuildInfo = site.build ?? { commit: null, date: null };
export const metrics: SiteMetrics = site.metrics ?? { tests: 0, testFiles: 0, npm: { name: "@procedures/client", version: null } };
export const counts: SiteCounts = site.counts;
export const examples: SiteExamples = site.examples;
