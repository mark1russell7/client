/**
 * The list of the docs pages (`scripts/docs-data.mjs` makes it from the Markdown of the
 * repository). The routes, the head tags and the sidebar use it. The content of a page loads
 * with the page (refer to `docs-content.ts`).
 */

import indexJson from "./generated/docs-index.js";

/** One docs page. */
export interface DocMeta {
  /** The route below `docs/`: "program-format", or "packages/client-git" for a README. */
  slug: string;
  /** The first H1 of the document. */
  title: string;
  /** The first paragraph with text, at most about 160 characters. */
  description: string;
  /** The group of the sidebar: "Guides", "Client library" or "Packages". */
  section: string;
  /** The path of the Markdown file in the repository. */
  source: string;
  /** The document title, with the words that people search for first. */
  pageTitle: string;
  /** For a README: the folder, the name and the description of the package. */
  package?: string;
  packageName?: string;
  packageDescription?: string;
  /** The number of JSON programs in the page. */
  programs: number;
}

/** A heading of a page: its id (the anchor), its text, and its level (2 or 3). */
export interface DocHeading {
  id: string;
  text: string;
  depth: number;
}

/** A part of a page: HTML, or a JSON program that the page can open in the Composer or run. */
export type DocSegment =
  | { type: "html"; html: string }
  | { type: "program"; html: string; program: unknown; runnable: boolean; expected?: string };

/** The content of one docs page. */
export interface DocPage {
  slug: string;
  toc: DocHeading[];
  segments: DocSegment[];
}

/** The text that starts each link of the site in the HTML of a page (the page puts the base there). */
export const BASE_MARKER = "%SITE_BASE%";

export const docs: DocMeta[] = indexJson as unknown as DocMeta[];

/** The groups of the sidebar, in order. */
export const DOC_SECTIONS: readonly string[] = ["Guides", "Client library", "Packages"];

export function docBySlug(slug: string): DocMeta | undefined {
  return docs.find((doc) => doc.slug === slug);
}

/** The page before and the page after a page, in the order of the sidebar. */
export function neighbours(slug: string): { previous?: DocMeta; next?: DocMeta } {
  const index = docs.findIndex((doc) => doc.slug === slug);
  if (index < 0) return {};
  return { ...(index > 0 ? { previous: docs[index - 1] } : {}), ...(index < docs.length - 1 ? { next: docs[index + 1] } : {}) };
}
