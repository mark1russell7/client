/**
 * The small list of the docs pages: only the slug, the heading and the document title of each.
 * The main bundle holds it (the router, the title of the page, the links to a README). The full
 * list, with the descriptions, is in `docs.ts` and loads with the pages that show it.
 */

import docRoutesJson from "./generated/docs-routes.js";

export interface DocRoute {
  slug: string;
  heading: string;
  /** The document title, with the words that people search for first. */
  title: string;
}

export const docRoutes: DocRoute[] = docRoutesJson as unknown as DocRoute[];

/** True when the docs have a page of that slug ("packages/client-git"). */
export function hasDoc(slug: string): boolean {
  return docRoutes.some((route) => route.slug === slug);
}
