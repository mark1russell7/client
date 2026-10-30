import { describe, it, expect } from "vitest";
import { breadcrumbs, headTags, jsonForScript, ogImageFile, type SiteFacts } from "./head-tags";
import { llmsTxt } from "./llms";
import { prerenderMode } from "./spa-fallback-plugin";
import { fileUrl, resolveSiteUrl, routeUrl } from "./site-url";
import { sitemapXml } from "./sitemap";
import { colorTokens, pageHtml, replaceTokenColors } from "./snapshot";
import { routeFiles, routeHtml, type StaticRoute } from "./static-routes";

const site: SiteFacts = {
  url: "https://example.github.io/client/",
  name: "client",
  libraryName: "@procedures/client",
  softwareDescription: "Typed procedures as data.",
  repository: "https://github.com/mark1russell7/client",
  license: "MIT",
  version: "1.0.0",
  author: "Mark Russell",
  keywords: ["typescript"],
};

const home: StaticRoute = { path: "", title: "Typed procedures | client", heading: "Typed procedures", description: "The home <page>.", section: "" };
const procedure: StaticRoute = {
  path: "catalog/git.status",
  title: "git.status: Get git status | client",
  heading: "git.status: Get git status",
  description: "Get git status.",
  section: "Procedures",
};
const TEMPLATE = `<html><head><title>Old</title><meta name="description" content="old" /></head><body><div id="root"></div></body></html>`;

describe("the URLs of the build", () => {
  it("resolves the site URL and gives each route its URL with a slash at the end", () => {
    expect(resolveSiteUrl(undefined, "https://example.github.io/client")).toBe("https://example.github.io/client/");
    expect(() => resolveSiteUrl("ftp://x", "https://a/")).toThrow(/https/);
    expect(routeUrl(site.url, "")).toBe("https://example.github.io/client/");
    expect(routeUrl(site.url, "catalog/git.status")).toBe("https://example.github.io/client/catalog/git.status/");
    expect(fileUrl(site.url, "og/index.png")).toBe("https://example.github.io/client/og/index.png");
  });

  it("writes two files for a route and one for the home page", () => {
    expect(routeFiles(home)).toEqual(["index.html"]);
    expect(routeFiles(procedure)).toEqual(["catalog/git.status.html", "catalog/git.status/index.html"]);
  });

  it("reads the prerender mode", () => {
    expect(prerenderMode("0")).toBe("off");
    expect(prerenderMode("off")).toBe("off");
    expect(prerenderMode("1")).toBe("required");
    expect(prerenderMode(undefined)).toBe("auto");
  });
});

describe("the head of a page", () => {
  it("puts the title and the escaped description into the template", () => {
    const html = routeHtml(TEMPLATE, home);
    expect(html).toContain("<title>Typed procedures | client</title>");
    expect(html).toContain('<meta name="description" content="The home &lt;page&gt;." />');
  });

  it("gives the canonical URL, Open Graph, the Twitter card and an article with breadcrumbs", () => {
    const tags = headTags(procedure, site);
    expect(tags).toContain('<link rel="canonical" href="https://example.github.io/client/catalog/git.status/" />');
    expect(tags).toContain(`content="https://example.github.io/client/${ogImageFile(procedure)}"`);
    expect(tags).toContain('<meta property="article:section" content="Procedures" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    const json = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(tags)?.[1] ?? "{}");
    expect(json["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual(["TechArticle", "BreadcrumbList"]);
    expect(breadcrumbs(procedure, site).map((crumb) => crumb.name)).toEqual(["client", "Procedures", "git.status: Get git status"]);
  });

  it("keeps a script element closed whatever the data holds", () => {
    expect(jsonForScript({ text: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

describe("the page HTML", () => {
  it("puts the prerendered body into the root element with the route", () => {
    const html = pageHtml(TEMPLATE, { route: procedure, head: "<!-- head -->", snapshot: { body: "<h1>git.status</h1>", links: [], colorAttributes: [] } });
    expect(html).toContain('<div id="root" data-prerendered="catalog/git.status"><h1>git.status</h1></div>');
    expect(html).toContain("<!-- head -->");
  });

  it("changes the colors of the tokens to variables, so the static HTML follows the dark theme", () => {
    const tokens = colorTokens(":root { --color-accent: #2346c4; --color-ink: #151c2e; }");
    expect(replaceTokenColors("color: #2346c4; border: rgb(21, 28, 46)", tokens)).toBe("color: var(--color-accent); border: var(--color-ink)");
  });
});

describe("the files for crawlers", () => {
  it("lists each URL once in the sitemap", () => {
    const xml = sitemapXml(["https://a/x/", "https://a/x/", "https://a/y/"], "2026-10-11T00:00:00Z");
    expect(xml.match(/<loc>/g)).toHaveLength(2);
    expect(xml).toContain("<lastmod>2026-10-11</lastmod>");
  });

  it("links each page in llms.txt", () => {
    const text = llmsTxt([home, procedure, { ...procedure, path: "lab", heading: "Lab", section: "Lab" }], site);
    expect(text).toContain("# @procedures/client");
    expect(text).toContain("- [Lab](https://example.github.io/client/lab/)");
    expect(text).toContain("## Procedures\n\n- [git.status: Get git status](https://example.github.io/client/catalog/git.status/): Get git status.");
  });
});
