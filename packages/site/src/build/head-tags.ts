/**
 * The head tags of each static page: the canonical URL, Open Graph, the Twitter card, the sitemap
 * and the structured data (schema.org, JSON-LD). From the AsyncBrowserContext site.
 */

import { fileUrl, routeUrl } from "./site-url";
import { escapeHtml, type StaticRoute } from "./static-routes";

/** Facts about the site and the library, for the head tags of each page. */
export interface SiteFacts {
  /** The absolute URL of the site, with a slash at the end. */
  url: string;
  /** The name of the site ("client"). */
  name: string;
  /** The name of the library ("@mark1russell7/client"). */
  libraryName: string;
  softwareDescription: string;
  repository: string;
  /** The SPDX ID of the license, for example "MIT". */
  license: string;
  version?: string;
  author?: string;
  keywords: readonly string[];
}

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const PROGRAMMING_LANGUAGE = "TypeScript";
const RUNTIME_PLATFORMS = ["Node.js", "Web browsers"];

/** The file of the Open Graph image of a route, in the build output: "og/index.png" for the home page. */
export function ogImageFile(route: Pick<StaticRoute, "path">): string {
  return `og/${route.path === "" ? "index" : route.path}.png`;
}

/** The text alternative of the Open Graph image of a route. */
export function ogImageAlt(route: StaticRoute, site: SiteFacts): string {
  const motif = "A program of procedure calls as a tree on graph paper.";
  return route.path === "" ? `${site.name}: ${route.heading}. ${motif}` : `${route.heading}, a page of the ${site.name} site. ${motif}`;
}

export interface Crumb {
  name: string;
  path: string;
}

/** The breadcrumb trail of a route: the home page, the section, and the page (when it is not the section). */
export function breadcrumbs(route: StaticRoute, site: SiteFacts): Crumb[] {
  const crumbs: Crumb[] = [{ name: site.name, path: "" }];
  if (route.path === "") return crumbs;
  const [section = ""] = route.path.split("/");
  crumbs.push({ name: route.section || section, path: section });
  if (route.path !== section) crumbs.push({ name: route.heading, path: route.path });
  return crumbs;
}

function licenseUrl(spdx: string): string {
  return `https://opensource.org/licenses/${encodeURIComponent(spdx)}`;
}

/**
 * The schema.org data of a route, as JSON-LD. The home page gets the site and the library. Each
 * other page gets an article and its breadcrumbs.
 */
export function structuredData(route: StaticRoute, site: SiteFacts): Record<string, unknown> {
  const websiteId = `${site.url}#website`;
  const softwareId = `${site.url}#software`;
  if (route.path === "") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": websiteId,
          url: site.url,
          name: site.name,
          description: route.description,
          inLanguage: "en",
        },
        {
          "@type": "SoftwareSourceCode",
          "@id": softwareId,
          name: site.libraryName,
          alternateName: site.name,
          description: site.softwareDescription,
          url: site.url,
          codeRepository: site.repository,
          programmingLanguage: PROGRAMMING_LANGUAGE,
          runtimePlatform: RUNTIME_PLATFORMS,
          keywords: site.keywords.join(", "),
          license: licenseUrl(site.license),
          ...(site.version === undefined ? {} : { version: site.version }),
          ...(site.author === undefined ? {} : { author: { "@type": "Person", name: site.author } }),
        },
      ],
    };
  }
  const url = routeUrl(site.url, route.path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        headline: route.heading,
        description: route.description,
        url,
        mainEntityOfPage: url,
        image: fileUrl(site.url, ogImageFile(route)),
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", "@id": websiteId, name: site.name, url: site.url },
        about: { "@type": "SoftwareSourceCode", "@id": softwareId, name: site.libraryName, codeRepository: site.repository },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs(route, site).map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: routeUrl(site.url, crumb.path),
        })),
      },
    ],
  };
}

/** JSON for a script element. Each "<", ">" and "&" becomes an escape, so the text cannot close the element. */
export function jsonForScript(value: unknown): string {
  const escape = (character: string): string => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  return JSON.stringify(value)
    .replace(/[<>&]/g, escape)
    .replace(new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, "g"), escape);
}

/**
 * The head tags of a route. The title and the description are already in the template (refer to
 * `routeHtml`).
 */
export function headTags(route: StaticRoute, site: SiteFacts): string {
  const url = routeUrl(site.url, route.path);
  const image = fileUrl(site.url, ogImageFile(route));
  const title = route.path === "" ? route.title : route.heading;
  const alt = ogImageAlt(route, site);
  const meta = (attribute: "name" | "property", key: string, value: string): string => `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
  const tags = [
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    meta("property", "og:type", route.path === "" ? "website" : "article"),
    meta("property", "og:site_name", site.name),
    meta("property", "og:title", title),
    meta("property", "og:description", route.description),
    meta("property", "og:url", url),
    meta("property", "og:image", image),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", String(OG_IMAGE_WIDTH)),
    meta("property", "og:image:height", String(OG_IMAGE_HEIGHT)),
    meta("property", "og:image:alt", alt),
    meta("property", "og:locale", "en_US"),
    ...(route.section ? [meta("property", "article:section", route.section)] : []),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", route.description),
    meta("name", "twitter:image", image),
    meta("name", "twitter:image:alt", alt),
    `<link rel="sitemap" type="application/xml" href="${escapeHtml(fileUrl(site.url, "sitemap.xml"))}" />`,
    `<script type="application/ld+json">${jsonForScript(structuredData(route, site))}</script>`,
  ];
  return tags.map((tag) => `    ${tag}`).join("\n");
}
