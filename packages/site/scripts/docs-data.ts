// The docs pages of the site, made at build time from the Markdown of the repository.
//
// The page bundle has no Markdown parser and no highlighter: this script converts each document
// to HTML (marked), colors the code blocks (highlight.js, with the classes that the site styles
// in both themes) and cuts the HTML at each JSON program, which the page shows with an "Open in
// the Composer" button and, for a small program, a "Run" button.
//
// Links: a link to another document of the site goes to its docs page; a link to any other file
// of the repository goes to GitHub; a link to the site itself becomes a link of the site. The
// links of the site start with BASE_MARKER, which the page replaces with the base of the site.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Marked, type Tokens } from "marked";
import { pathToKey } from "@procedures/client/browser";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

export const REPOSITORY_URL = "https://github.com/mark1russell7/client";
/** The name of the site, at the end of each document title. */
export const SITE_NAME = "client";
export const SITE_URL = "https://mark1russell7.github.io/client/";
/** The text that starts each link of the site in the HTML. The page replaces it with its base path. */
export const BASE_MARKER = "%SITE_BASE%";

/** The target of a link: its address, and whether it leaves the site. */
export interface LinkTarget {
  href: string;
  external: boolean;
}

/** A heading of the table of contents. */
export interface ConvertedHeading {
  id: string;
  text: string;
  depth: number;
}

/** A part of a docs page: HTML, or a JSON program. */
export type ConvertedSegment =
  | { type: "html"; html: string }
  | { type: "program"; html: string; program: unknown; runnable: boolean; expected?: string };

/** The result of `convertMarkdown`. */
export interface ConvertedDoc {
  title: string | null;
  description: string;
  toc: ConvertedHeading[];
  segments: ConvertedSegment[];
  programs: number;
}

/** The fields of a catalog package that the docs pages read. */
export interface DocPackage {
  dir: string;
  name: string;
  description?: string;
}

/** A document of the site. */
export interface DocSource {
  slug: string;
  file: string;
  path: string;
  section: string;
  seoTitle?: string;
  package?: DocPackage;
}

/** A line of the list of the docs pages. */
export interface DocsIndexEntry {
  slug: string;
  title: string;
  description: string;
  section: string;
  source: string;
  pageTitle: string;
  package?: string;
  packageName?: string;
  packageDescription?: string;
  programs: number;
}

/** The result of `readDocs`. */
export interface DocsData {
  index: DocsIndexEntry[];
  routes: Array<{ slug: string; heading: string; title: string }>;
  pages: Record<string, { slug: string; toc: ConvertedHeading[]; segments: ConvertedSegment[] }>;
  search: Array<{ slug: string; title: string; headings: Array<{ id: string; text: string }> }>;
}

/** A JSON program of a document, before the segments of the page exist. */
interface ProgramBlock {
  program: Record<string, unknown>;
  expected: string;
  html: string;
  runnable: boolean;
  keys: string[];
}

for (const [name, language] of Object.entries({ bash, diff, dockerfile, ini, javascript, json, plaintext, powershell, shell, sql, typescript, xml, yaml })) {
  hljs.registerLanguage(name, language);
}
/** The names that the code blocks use for the languages above. */
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  mjs: "javascript",
  jsx: "javascript",
  jsonc: "json",
  json5: "json",
  sh: "bash",
  zsh: "bash",
  console: "shell",
  ps1: "powershell",
  yml: "yaml",
  html: "xml",
  toml: "ini",
  text: "plaintext",
  txt: "plaintext",
};

/** The HTML tags that a document can use as they are. Any other HTML shows as text. */
const SAFE_TAGS = /^<\/?(details|summary|br|kbd|sub|sup|b|i|em|strong|code|hr)\s*\/?>$/i;

/** The ids of the page that a heading must not take. */
const RESERVED_IDS = new Set(["main", "root", "app"]);

export function escapeHtml(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The characters of the HTML entities that `plainText` decodes. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

/**
 * This function removes the HTML tags of a text. It repeats the strip until the text does not change.
 * One pass gives the same text, but the code scanner of the repository examines only this form.
 * Then it removes each "<" that starts a tag, for example after "<<b>script>". A "<" before a space or a digit stays.
 */
function stripTags(text: string): string {
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]+>/g, "");
  } while (text !== previous);
  return text.replace(/<(?=[A-Za-z/!?])/g, "");
}

/** The plain text of a line of inline Markdown: code spans, emphasis, links and images lose their marks. */
export function plainText(markdown: string): string {
  const marked = String(markdown)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    // An escaped "<" becomes an entity, so stripTags keeps it
    .replace(/\\</g, "&lt;");
  return stripTags(marked)
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, "$1")
    // One pass for all the entities, so that "&amp;lt;" becomes "&lt;" and not "<"
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ENTITIES[name]!)
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of a description: one or two sentences, at most about `limit` characters. */
export function clip(text: string, limit = 160): string {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 20))}…`;
}

/**
 * The ids of the headings of one page, as GitHub makes them: lower case, no punctuation, a
 * hyphen for each space, and "-1", "-2" for a repeated heading. So a link to "#the-ref-key"
 * that works on GitHub works on the site too.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    let base = plainText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s/g, "-");
    if (base === "") base = "section";
    if (RESERVED_IDS.has(base)) base = `${base}-section`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/** The HTML of a code block: the colored code, or the escaped text for a language that the script does not know. */
export function highlightCode(code: string, language: string): string {
  const name = LANGUAGE_ALIASES[language] ?? language;
  if (name && hljs.getLanguage(name)) {
    try {
      return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
    } catch {
      // Fall through to the plain text
    }
  }
  return escapeHtml(code);
}

/** True for an image that is a badge (shields.io, a CI badge): the docs pages leave them out. */
function isBadge(src: string): boolean {
  return /img\.shields\.io|badge\.svg|badgen\.net|\/badge\b/i.test(src);
}

/**
 * The program of a JSON code block (an object with a `$proc` list) and its expected result, or
 * null. The documents write the result as comment lines after the program (`// 3`): they are not
 * JSON, so they are read apart.
 */
export function programOf(code: string): { program: Record<string, unknown>; expected: string } | null {
  const lines = String(code).split(/\r?\n/);
  const comments = lines.filter((line) => line.trim().startsWith("//")).map((line) => line.trim().replace(/^\/\/\s?/, ""));
  const body = lines.filter((line) => !line.trim().startsWith("//")).join("\n");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value) || !Array.isArray((value as { $proc?: unknown }).$proc)) return null;
  return { program: value as Record<string, unknown>, expected: comments.join("\n") };
}

/** The procedure keys ("client.add") of a program. */
export function programKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) programKeys(item, keys);
  } else if (value !== null && typeof value === "object") {
    const path = (value as { $proc?: unknown }).$proc;
    if (Array.isArray(path) && path.every((part) => typeof part === "string")) keys.add(pathToKey(path));
    for (const item of Object.values(value)) programKeys(item, keys);
  }
  return keys;
}

/** The longest program, as JSON text, that a docs page can run with its "Run" button. */
export const RUNNABLE_LIMIT = 4000;

/**
 * This function converts one Markdown document. `resolveLink` gives the target of a link (refer
 * to `linkResolver`); `canRun` tells if the browser has a procedure (a key such as "client.add").
 *
 * The result: the title (the first H1), the description (the first paragraph with text), the
 * table of contents (H2 and H3), and the segments of the page: HTML, and the JSON programs.
 */
export function convertMarkdown(
  markdown: string,
  {
    resolveLink = (href) => ({ href, external: /^[a-z]+:/i.test(href) }),
    canRun = () => false,
  }: { resolveLink?: (href: string) => LinkTarget; canRun?: (key: string) => boolean } = {},
): ConvertedDoc {
  const slug = createSlugger();
  const toc: ConvertedHeading[] = [];
  const programs: ProgramBlock[] = [];
  let title: string | null = null;

  const marked = new Marked({ gfm: true, async: false });
  const tokens = marked.lexer(markdown);

  // The description: the first paragraph after the title that has text (a line of badges has none)
  let description = "";
  for (const token of tokens) {
    if (token.type !== "paragraph") continue;
    const text = plainText(token.text);
    if (text !== "") {
      description = text;
      break;
    }
  }

  marked.use({
    renderer: {
      heading({ tokens: inline, depth, text }) {
        const plain = plainText(text);
        if (depth === 1 && title === null) {
          // The page shows the title in its header
          title = plain;
          return "";
        }
        const id = slug(text);
        if (depth === 2 || depth === 3) toc.push({ id, text: plain, depth });
        const html = this.parser.parseInline(inline);
        return `<h${depth} id="${id}">${html}<a class="heading-anchor" href="#${id}" aria-label="Link to the section ${escapeHtml(plain)}">#</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = String(lang ?? "").trim().split(/\s+/)[0]!.toLowerCase();
        if (language === "mermaid") {
          return (
            `<figure class="doc-diagram"><figcaption>Diagram source (Mermaid). GitHub draws it on the page of the file.</figcaption>` +
            `<pre class="doc-code scroll-cue" tabindex="0"><code>${escapeHtml(text)}</code></pre></figure>\n`
          );
        }
        const label = language ? ` data-lang="${escapeHtml(language)}"` : "";
        const pre = `<pre class="doc-code scroll-cue"${label} tabindex="0"><code class="hljs">${highlightCode(text, language)}</code></pre>`;
        if (language === "json" || language === "jsonc") {
          const found = programOf(text);
          if (found !== null) {
            const keys = [...programKeys(found.program)];
            const runnable = text.length <= RUNNABLE_LIMIT && keys.length > 0 && keys.every((key) => canRun(key));
            programs.push({ program: found.program, expected: found.expected, html: pre, runnable, keys });
            return `<!--doc-program:${programs.length - 1}-->\n`;
          }
        }
        return `${pre}\n`;
      },
      paragraph({ tokens: inline }) {
        const html = this.parser.parseInline(inline);
        // A line of badges is empty without its images
        return html.trim() === "" ? "" : `<p>${html}</p>\n`;
      },
      link({ href, title: linkTitle, tokens: inline }) {
        const text = this.parser.parseInline(inline);
        // A link around a badge has no text without its image: no link
        if (text.trim() === "") return "";
        const target = resolveLink(href ?? "");
        const titleAttribute = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : "";
        return `<a href="${escapeHtml(target.href)}"${titleAttribute}${target.external ? ' rel="noopener"' : ""}>${text}</a>`;
      },
      image({ href, text }) {
        // A badge is noise on the site. Another image becomes a link (an image needs its size on the page).
        if (isBadge(href ?? "")) return "";
        const target = resolveLink(href ?? "");
        return `<a href="${escapeHtml(target.href)}">${escapeHtml(text || "Image")}</a>`;
      },
      html({ text }) {
        const trimmed = String(text).trim();
        if (/^<!--[\s\S]*-->$/.test(trimmed)) return "";
        return SAFE_TAGS.test(trimmed) ? trimmed : escapeHtml(text);
      },
      table(token) {
        const cell = (item: Tokens.TableCell, tag: string): string => {
          const align = item.align ? ` style="text-align: ${item.align}"` : "";
          return `<${tag}${align}>${this.parser.parseInline(item.tokens)}</${tag}>`;
        };
        const head = `<tr>${token.header.map((item) => cell(item, "th")).join("")}</tr>`;
        const body = token.rows.map((row) => `<tr>${row.map((item) => cell(item, "td")).join("")}</tr>`).join("");
        // A wide table scrolls in its own box, so the page never scrolls sideways
        return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });

  const html = marked.parser(tokens);
  const segments: ConvertedSegment[] = [];
  const parts = html.split(/<!--doc-program:(\d+)-->\n?/);
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (index % 2 === 0) {
      if (part.trim() !== "") segments.push({ type: "html", html: part });
    } else {
      const program = programs[Number(part)]!;
      segments.push({
        type: "program",
        html: program.html,
        program: program.program,
        runnable: program.runnable,
        ...(program.expected ? { expected: program.expected } : {}),
      });
    }
  }
  return { title, description, toc, segments, programs: programs.length };
}

// ---------------------------------------------------------------------------
// The documents of the site
// ---------------------------------------------------------------------------

/** The guides and the documents of the client library, in the order of the sidebar. */
const FIXED_DOCS = [
  { slug: "onboarding", file: "documentation/ONBOARDING.md", section: "Guides", seoTitle: "Getting started: build, test and run the monorepo" },
  { slug: "program-format", file: "documentation/PROGRAM-FORMAT.md", section: "Guides", seoTitle: "Program format: procedure calls as JSON with $proc and $ref" },
  { slug: "architecture", file: "documentation/ARCHITECTURE.md", section: "Guides", seoTitle: "Architecture: hosts, transports, streaming and the call policy" },
  { slug: "release", file: "documentation/RELEASE.md", section: "Guides", seoTitle: "Release: publish the packages to npm with changesets" },
  { slug: "client-api", file: "client/docs/CLIENT.md", section: "Client library", seoTitle: "Client API: typed calls, streams and middleware" },
  { slug: "server-api", file: "client/docs/SERVER.md", section: "Client library", seoTitle: "Server API: procedure servers for HTTP and WebSocket" },
  { slug: "transports", file: "client/docs/ADAPTERS.md", section: "Client library", seoTitle: "Transports: HTTP, WebSocket and local adapters" },
  { slug: "middleware", file: "client/docs/MIDDLEWARE.md", section: "Client library", seoTitle: "Middleware: retry, timeout, cache and circuit breaker" },
  { slug: "policy", file: "client/docs/POLICY.md", section: "Client library", seoTitle: "Call policy and interceptors: expose, calls and strictCalls" },
  { slug: "capabilities", file: "client/docs/CAPABILITIES.md", section: "Client library", seoTitle: "Capabilities: effects, clearances and deadlines for each call" },
];

/**
 * The documents of the site: the fixed documents, then the README of each package (`client`
 * first, then by folder). `packages` are the packages of the catalog (`dir`, `name`, `description`).
 */
export function docSources(packagesDir: string, packages: DocPackage[]): DocSource[] {
  const sources: DocSource[] = FIXED_DOCS.map((doc) => ({ ...doc, path: join(packagesDir, ...doc.file.split("/")) }));
  const dirs = packages
    .map((pkg) => pkg.dir)
    .filter((dir) => dir !== "site" && existsSync(join(packagesDir, dir, "README.md")))
    .sort((a, b) => (a === "client" ? -1 : b === "client" ? 1 : a.localeCompare(b)));
  for (const dir of dirs) {
    const pkg = packages.find((candidate) => candidate.dir === dir)!;
    sources.push({ slug: `packages/${dir}`, file: `${dir}/README.md`, path: join(packagesDir, dir, "README.md"), section: "Packages", package: pkg });
  }
  return sources.filter((source) => existsSync(source.path));
}

/**
 * The link target function of one document. `docsByPath` maps the absolute path of each document
 * of the site (lower case) to its slug.
 */
export function linkResolver({ file, repoRoot, docsByPath }: { file: string; repoRoot: string; docsByPath: Map<string, string> }): (href: string) => LinkTarget {
  const fileDir = dirname(file);
  return (rawHref) => {
    const href = String(rawHref).trim();
    if (href === "" || href.startsWith("#")) return { href, external: false };
    if (/^https?:\/\//i.test(href)) {
      // A link to the site itself becomes a link of the site (no reload)
      if (href.startsWith(SITE_URL)) return { href: `${BASE_MARKER}${href.slice(SITE_URL.length)}`, external: false };
      return { href, external: true };
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { href, external: true };
    const [pathPart, hash = ""] = href.split("#", 2);
    const anchor = hash ? `#${hash}` : "";
    const target = resolve(fileDir, decodeURIComponent(pathPart!));
    const key = target.toLowerCase();
    const doc = docsByPath.get(key) ?? docsByPath.get(join(target, "README.md").toLowerCase());
    if (doc !== undefined) return { href: `${BASE_MARKER}docs/${doc}/${anchor}`, external: false };
    // A package folder without its README in the docs, or any other file: its page on GitHub
    const repoPath = relative(repoRoot, target).split(sep).join("/");
    if (repoPath.startsWith("..")) return { href, external: true };
    const isDir = existsSync(target) && statSync(target).isDirectory();
    const kind = isDir || (!existsSync(target) && !/\.[a-z0-9]+$/i.test(repoPath)) ? "tree" : "blob";
    return { href: `${REPOSITORY_URL}/${kind}/main/${repoPath}${anchor}`, external: true };
  };
}

/**
 * This function reads and converts every document of the site. `canRun(key)` tells if the browser
 * runtime has a procedure. The result:
 * - `index`: the list of the pages (slug, title, description, section, source), for the head
 *   tags, the sidebar and the index page;
 * - `routes`: only the slug, the heading and the document title of each page, for the main
 *   bundle (the router and the title of the page);
 * - `pages`: the content of each page (loaded with the page);
 * - `search`: the headings of each page, for the command palette.
 */
export function readDocs(packagesDir: string, packages: DocPackage[], { canRun = () => false }: { canRun?: (key: string) => boolean } = {}): DocsData {
  const repoRoot = dirname(packagesDir);
  const sources = docSources(packagesDir, packages);
  const docsByPath = new Map(sources.map((source) => [source.path.toLowerCase(), source.slug]));
  const index: DocsData["index"] = [];
  const routes: DocsData["routes"] = [];
  const pages: DocsData["pages"] = {};
  const search: DocsData["search"] = [];
  for (const source of sources) {
    const markdown = readFileSync(source.path, "utf8");
    const resolveLink = linkResolver({ file: source.path, repoRoot, docsByPath });
    const converted = convertMarkdown(markdown, { resolveLink, canRun });
    const repoPath = relative(repoRoot, source.path).split(sep).join("/");
    const pkg = source.package;
    const title = converted.title ?? pkg?.name ?? source.slug;
    const description = clip(converted.description || pkg?.description || title);
    // The document title puts the words that people search for first, then the site name
    const what = String(pkg?.description || description).replace(/\.$/, "");
    const pageTitle = pkg ? `${pkg.name}: ${clip(what, 60)} | ${SITE_NAME}` : `${source.seoTitle ?? title} | ${SITE_NAME}`;
    routes.push({ slug: source.slug, heading: pkg?.name ?? title, title: pageTitle });
    index.push({
      slug: source.slug,
      title,
      description,
      section: source.section,
      source: repoPath,
      pageTitle,
      ...(pkg ? { package: pkg.dir, packageName: pkg.name, packageDescription: pkg.description ?? "" } : {}),
      programs: converted.programs,
    });
    pages[source.slug] = { slug: source.slug, toc: converted.toc, segments: converted.segments };
    search.push({ slug: source.slug, title, headings: converted.toc.map((heading) => ({ id: heading.id, text: heading.text })) });
  }
  return { index, routes, pages, search };
}

/** The file name of the module of one page: "packages/client-git" gives "packages--client-git". */
export function docModuleName(slug: string): string {
  return slug.replace(/\//g, "--");
}
