/**
 * The title and the description of each page. The app sets them after each navigation, and the
 * build writes them in the HTML file of each static page with the Open Graph tags, the
 * structured data and the sitemap (refer to `build/`). One module for both keeps them equal.
 *
 * The titles put the words that people search for first, then the site name.
 */

import { mcpTools, packages, procedureByKey, procedures } from "../data";

/** The name of the site, as the header shows it. */
export const SITE_NAME = "client";
/** The name of the library on GitHub and npm. */
export const LIBRARY_NAME = "@mark1russell7/client";
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
      `Procedure catalog: ${procedures.length} typed procedures`,
      `Search ${procedures.length} typed procedures: git, docker, pnpm, vitest, MongoDB, SQLite, S3 and more. Each with its JSON Schemas, CLI command and MCP tool.`,
    ),
    page(
      "architecture",
      `Architecture: one call's journey, ${packages.length} packages`,
      "One streaming call through the real middlewares, transport, server and interceptors (HTTP, WebSocket, MCP), and the package map.",
    ),
    page(
      "lab",
      "Middleware lab: retry, timeout, circuit breaker",
      "Run the real client middlewares around a server that you break: latency, errors, a dead peer, a slow stream. Watch each request go through the layers.",
    ),
    page(
      "claude",
      `MCP tools for Claude Code: ${mcpTools.length} procedures`,
      `The ${mcpTools.length} procedures that the dev-tools MCP server gives to Claude Code as tools, and the rules that keep shell access out of them.`,
    ),
    page(
      "status",
      "Bug and finding status board",
      "The status of each finding of the October 2026 deep dive and each bug of the July audit, with its severity and the commits that fixed it.",
    ),
  ];
}

/** The meta data of the page of one procedure. */
function procedurePage(key: string): PageMeta | null {
  const procedure = procedureByKey(key);
  if (!procedure) return null;
  const pkg = packages.find((candidate) => candidate.dir === procedure.package);
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
function packagePage(dir: string): PageMeta | null {
  const pkg = packages.find((candidate) => candidate.dir === dir);
  if (!pkg) return null;
  const description = clip(
    `${pkg.description || pkg.name}. ${pkg.procedures > 0 ? `${pkg.procedures} procedures, ` : ""}${pkg.lines.toLocaleString("en-US")} lines of TypeScript, and the packages it uses.`,
  );
  return page(`architecture/${pkg.dir}`, `${pkg.name} package`, description);
}

/**
 * The meta data of a route, or null for a route that has no page (the app shows its "not
 * found" page). The query does not change the meta data.
 */
export function metaOf(route: { page: string; rest: string }): PageMeta | null {
  if (route.rest === "") return fixedPages().find((candidate) => candidate.path === route.page) ?? null;
  if (route.page === "catalog") return procedurePage(route.rest);
  if (route.page === "architecture") return packagePage(route.rest);
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

/** Every page that the build writes as its own HTML file: the fixed pages, each procedure and each package. */
export function staticPages(): PageMeta[] {
  const procedurePages = [...procedures]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((procedure) => procedurePage(procedure.key))
    .filter((meta): meta is PageMeta => meta !== null);
  const packagePages = [...packages]
    .sort((a, b) => a.dir.localeCompare(b.dir))
    .map((pkg) => packagePage(pkg.dir))
    .filter((meta): meta is PageMeta => meta !== null);
  return [...fixedPages(), ...procedurePages, ...packagePages];
}
