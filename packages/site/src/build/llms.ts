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
  const guides = routes.filter((route) => route.path.startsWith("docs/") && !route.path.startsWith("docs/packages/"));
  const readmes = routes.filter((route) => route.path.startsWith("docs/packages/"));
  return [
    `# ${site.libraryName}`,
    "",
    `> ${site.softwareDescription}`,
    "",
    "A procedure has a path, an input schema, an output schema and a handler. The `./register` entry of a package",
    "registers its procedures: `import \"@procedures/git/register\"`. An import of the package root registers",
    "nothing. The CLI (`mark`), HTTP, WebSocket, the MCP server of Claude Code and your own code call the same registry. A program is JSON: an object with `$proc` is a call, and `$ref` reads an earlier result.",
    "",
    `- Source: ${site.repository}`,
    `- Program format: ${routeUrl(site.url, "docs/program-format")}`,
    `- Architecture: ${routeUrl(site.url, "docs/architecture")}`,
    "",
    "## Pages",
    "",
    ...main.map(link),
    "",
    "## Docs",
    "",
    ...guides.map(link),
    "",
    "## Package READMEs",
    "",
    ...readmes.map(link),
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
