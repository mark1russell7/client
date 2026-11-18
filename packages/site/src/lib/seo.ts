/**
 * The title and the description of each page. The app sets them after each navigation, and the
 * build writes them in the HTML file of each static page with the Open Graph tags, the
 * structured data and the sitemap (refer to `build-time/`). One module for both keeps them equal.
 *
 * The main bundle has this module, but not the catalog: the catalog grows with each library that
 * becomes procedures. Thus the page of a procedure or of a package gets its meta data only with
 * the catalog. The build gives the full catalog. The app loads it when a route needs it.
 *
 * The titles put the words that people search for first, then the site name.
 */

import type { PackageInfo, ProcedureSummary } from "../data";
import { counts } from "../data/site";
import { docRoutes } from "../data/doc-routes";

/** The name of the site, as the header shows it. */
export const SITE_NAME = "client";
/** The name of the library on GitHub and npm. */
export const LIBRARY_NAME = "@procedures/client";
export const REPOSITORY_URL = "https://github.com/mark1russell7/client";
/** The published address of the site. The build can take another one from SITE_URL. */
export const SITE_URL = "https://mark1russell7.github.io/client/";
export const SITE_TAGLINE = "Typed procedures as data for TypeScript";

/** The meta data of one page. */
export interface PageMeta {
  /** The route path: "" for the home page, "catalog/git.status" for a procedure. */
  path: string;
  /** The document title. */
  title: string;
  /** The title of the page without the site name, for the cards and the breadcrumbs. */
  heading: string;
  description: string;
  /** The section of the page in the navigation, for example "Procedures". Empty for the home page. */
  section: string;
}

/** The label of each section, as the navigation shows it. */
export const SECTIONS: Readonly<Record<string, string>> = {
  composer: "Composer",
  catalog: "Procedures",
  architecture: "Architecture",
  lab: "Lab",
  claude: "What Claude sees",
  status: "Status",
  releases: "Releases",
  docs: "Docs",
};

function page(path: string, heading: string, description: string, title?: string): PageMeta {
  const section = SECTIONS[path.split("/")[0] ?? ""] ?? "";
  return { path, title: title ?? `${heading} | ${SITE_NAME}`, heading, description, section };
}

/** A description that a search result can show: one or two sentences, at most about 160 characters. */
function clip(text: string, limit = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 20))}…`;
}

/** The meta data of the fixed pages. */
function fixedPages(): PageMeta[] {
  return [
    page(
      "",
      "Typed procedures as data",
      "One typed procedure registry for your code, a CLI, HTTP, WebSocket and Claude Code (MCP). Compose calls as JSON, with streaming and a visual composer.",
      `${SITE_TAGLINE}: CLI, HTTP and MCP | ${SITE_NAME}`,
    ),
    page(
      "composer",
      "Visual composer for JSON programs",
      "Build a program of procedure calls with blocks, JSON or TypeScript, and run it in your browser, with a live trace and a graph of the calls.",
    ),
    page(
      "catalog",
      `Procedure catalog: ${counts.procedures} typed procedures`,
      `Search ${counts.procedures} typed procedures: git, docker, pnpm, vitest, MongoDB, SQLite, S3 and more. Each with its JSON Schemas, CLI command and MCP tool.`,
    ),
    page(
      "architecture",
      `Architecture: one call's journey, ${counts.packages} packages`,
      "One streaming call through the real middlewares, transport, server and interceptors (HTTP, WebSocket, MCP), and the package map.",
    ),
    page(
      "lab",
      "Middleware lab: retry, timeout, circuit breaker",
      "Run the real client middlewares around a server that you break: latency, errors, a dead peer, a slow stream. Watch each request go through the layers.",
    ),
    page(
      "claude",
      `MCP tools for Claude Code: ${counts.mcpTools} procedures`,
      `The ${counts.mcpTools} procedures that the dev-tools MCP server gives to Claude Code as tools, and the rules that keep shell access out of them.`,
    ),
    page(
      "status",
      "Status",
      "The open work of the roadmap, the open pull requests and the open issues of the repository, read from the roadmap file and GitHub at each build.",
    ),
    page(
      "releases",
      "Releases",
      "Each release of the @procedures/* packages on a timeline: its date, its kind (MINOR or PATCH) and its changes, from the changelogs.",
    ),
    page(
      "docs",
      "Documentation: guides, the program format and every package",
      "The guides, the program format, the client library and the README of each package, with programs that run in your browser.",
      `Documentation: guides, API and package READMEs | ${SITE_NAME}`,
    ),
  ];
}

/**
 * The docs pages: only the slug, the heading and the document title of each (the main bundle
 * holds this small list). The descriptions come with the full list of the docs (refer to
 * `registerDocDescriptions`): the build gives them, and so does the docs page when it loads.
 */
const docDescriptions = new Map<string, string>();

/** This function gives the descriptions of the docs pages to the meta data (slug to description). */
export function registerDocDescriptions(descriptions: Iterable<readonly [string, string]>): void {
  for (const [slug, description] of descriptions) docDescriptions.set(slug, description);
}

/** The meta data of one docs page. */
function docPage(slug: string): PageMeta | null {
  const route = docRoutes.find((candidate) => candidate.slug === slug);
  if (!route) return null;
  const description = docDescriptions.get(slug) ?? `${route.heading}: a page of the documentation of ${LIBRARY_NAME}.`;
  return page(`docs/${slug}`, route.heading, clip(description), route.title);
}

/** The procedures and the packages of the catalog (refer to `data/index.ts`). */
export interface CatalogData {
  procedures: readonly ProcedureSummary[];
  packages: readonly PackageInfo[];
}

/** The maps of one catalog by key and by folder. The pages of a large catalog need no linear search. */
interface CatalogIndex {
  procedures: ReadonlyMap<string, ProcedureSummary>;
  packages: ReadonlyMap<string, PackageInfo>;
}

const indexes = new WeakMap<CatalogData, CatalogIndex>();

/** This function gives the maps of a catalog. It makes them one time for each catalog. */
function indexOf(catalog: CatalogData): CatalogIndex {
  let index = indexes.get(catalog);
  if (index === undefined) {
    index = {
      procedures: new Map(catalog.procedures.map((procedure) => [procedure.key, procedure])),
      packages: new Map(catalog.packages.map((pkg) => [pkg.dir, pkg])),
    };
    indexes.set(catalog, index);
  }
  return index;
}

/** The meta data of the page of one procedure. */
function procedurePage(catalog: CatalogIndex, key: string): PageMeta | null {
  const procedure = catalog.procedures.get(key);
  if (!procedure) return null;
  const pkg = catalog.packages.get(procedure.package);
  const hosts = [procedure.cli ? `the CLI command mark ${procedure.path.join(" ")}` : "", procedure.mcp ? "an MCP tool" : ""].filter(Boolean);
  const summary = procedure.description ? procedure.description.trim().replace(/([^.!?])$/, "$1.") : `The ${procedure.key} procedure.`;
  const description = clip(
    `${summary} A procedure of ${pkg?.name ?? procedure.package}` +
      `${hosts.length > 0 ? `, also ${hosts.join(" and ")}` : ""}. Its input and output schemas.`,
  );
  const short = procedure.description ? clip(procedure.description.replace(/\.$/, ""), 50) : "a typed procedure";
  return page(`catalog/${procedure.key}`, `${procedure.key}: ${short}`, description);
}

/** The meta data of the architecture page that shows one package. */
function packagePage(catalog: CatalogIndex, dir: string): PageMeta | null {
  const pkg = catalog.packages.get(dir);
  if (!pkg) return null;
  const description = clip(
    `${pkg.description || pkg.name}. ${pkg.procedures > 0 ? `${pkg.procedures} procedures, ` : ""}${pkg.lines.toLocaleString("en-US")} lines of TypeScript, and the packages it uses.`,
  );
  return page(`architecture/${pkg.dir}`, `${pkg.name} package`, description);
}

/** This function tells if the meta data of a route needs the catalog: the page of a procedure or of a package. */
export function needsCatalog(route: { page: string; rest: string }): boolean {
  return route.rest !== "" && (route.page === "catalog" || route.page === "architecture");
}

/**
 * The meta data of a route, or null for a route that has no page (the app shows its "not
 * found" page). The query does not change the meta data. The result is undefined when the route
 * needs the catalog (refer to `needsCatalog`) and the catalog is null: the app then waits for it.
 */
export function metaOf(route: { page: string; rest: string }, catalog: CatalogData | null = null): PageMeta | null | undefined {
  if (route.rest === "") return fixedPages().find((candidate) => candidate.path === route.page) ?? null;
  if (needsCatalog(route)) {
    if (catalog === null) return undefined;
    const index = indexOf(catalog);
    return route.page === "catalog" ? procedurePage(index, route.rest) : packagePage(index, route.rest);
  }
  if (route.page === "docs") return docPage(route.rest);
  return null;
}

/** The meta data of the "not found" page. */
export const NOT_FOUND_META: PageMeta = {
  path: "",
  title: `Page not found | ${SITE_NAME}`,
  heading: "Page not found",
  description: "This address has no page.",
  section: "",
};

/** The meta data of a page that did not load its data, for example after a deploy removed a chunk. */
export const LOAD_FAILURE_META: PageMeta = {
  path: "",
  title: `Page error | ${SITE_NAME}`,
  heading: "This page stopped with an error",
  description: "This page did not load its data. Load the page again.",
  section: "",
};

/**
 * Every page that the build writes as its own HTML file: the fixed pages, each procedure and each
 * package. The build gives the full catalog.
 */
export function staticPages(catalog: CatalogData): PageMeta[] {
  const index = indexOf(catalog);
  const procedurePages = [...catalog.procedures]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((procedure) => procedurePage(index, procedure.key))
    .filter((meta): meta is PageMeta => meta !== null);
  const packagePages = [...catalog.packages]
    .sort((a, b) => a.dir.localeCompare(b.dir))
    .map((pkg) => packagePage(index, pkg.dir))
    .filter((meta): meta is PageMeta => meta !== null);
  const docPages = docRoutes.map((route) => docPage(route.slug)).filter((meta): meta is PageMeta => meta !== null);
  return [...fixedPages(), ...procedurePages, ...packagePages, ...docPages];
}
