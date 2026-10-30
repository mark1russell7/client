/**
 * The static pages of the site, and the HTML file of each (from the AsyncBrowserContext site).
 */

import type { PageMeta } from "../lib/seo";

/** One page that the build writes as its own HTML file. */
export type StaticRoute = PageMeta;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * This function gives the HTML of one route: the HTML of the app with the title and the
 * description of the route. The app sets both again when it starts. A search engine and a link
 * preview read them before that.
 */
export function routeHtml(template: string, route: StaticRoute): string {
  const html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(route.title)}</title>`);
  return html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${escapeHtml(route.description)}" />`);
}

/**
 * The files of one route. GitHub Pages serves "lab.html" for the path "lab", and
 * "catalog/index.html" for "catalog/". So a route gets both files. The home page is "index.html".
 */
export function routeFiles(route: Pick<StaticRoute, "path">): string[] {
  return route.path === "" ? ["index.html"] : [`${route.path}.html`, `${route.path}/index.html`];
}
