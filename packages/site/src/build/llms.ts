/**
 * The `llms.txt` file of the site (https://llmstxt.org): a short summary in Markdown, with links
 * to the pages, so a language model can read the site in one request.
 */

import type { SiteFacts } from "./head-tags";
import { routeUrl } from "./site-url";
import type { StaticRoute } from "./static-routes";

/** The text of `llms.txt`: the summary, the main pages, then one line for each procedure and each package. */
export function llmsTxt(routes: readonly StaticRoute[], site: SiteFacts): string {
  const link = (route: StaticRoute): string => `- [${route.heading}](${routeUrl(site.url, route.path)}): ${route.description}`;
  const main = routes.filter((route) => route.path !== "" && !route.path.includes("/"));
  const procedures = routes.filter((route) => route.path.startsWith("catalog/"));
  const packages = routes.filter((route) => route.path.startsWith("architecture/"));
  return [
    `# ${site.libraryName}`,
    "",
    `> ${site.softwareDescription}`,
    "",
    "A procedure has a path, an input schema, an output schema and a handler. A package registers its procedures",
    "when you import it. The CLI (`mark`), HTTP, WebSocket, the MCP server of Claude Code and your own code call the",
    "same registry. A program is JSON: an object with `$proc` is a call, and `$ref` reads an earlier result.",
    "",
    `- Source: ${site.repository}`,
    `- Program format: ${site.repository}/blob/main/packages/documentation/PROGRAM-FORMAT.md`,
    `- Architecture: ${site.repository}/blob/main/packages/documentation/ARCHITECTURE.md`,
    "",
    "## Pages",
    "",
    ...main.map(link),
    "",
    "## Procedures",
    "",
    ...procedures.map(link),
    "",
    "## Packages",
    "",
    ...packages.map(link),
    "",
  ].join("\n");
}
