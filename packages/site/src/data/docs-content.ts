/**
 * The content of the docs pages. Each page is a module of its own, so a page loads only its own
 * HTML. Only the docs page imports this module (the build plugin does not: it runs in Node, where
 * `import.meta.glob` does not exist).
 */

import type { DocPage } from "./docs";

/** The module of each page, by its file: "./generated/docs/packages--client-git.js". */
const modules = import.meta.glob<{ default: unknown }>("./generated/docs/*.js");

/** The file name of the module of a page: "packages/client-git" gives "packages--client-git". */
export function docModuleName(slug: string): string {
  return slug.replace(/\//g, "--");
}

/** The content of a page, or undefined when the docs have no page of that slug. */
export async function loadDoc(slug: string): Promise<DocPage | undefined> {
  const load = modules[`./generated/docs/${docModuleName(slug)}.js`];
  if (!load) return undefined;
  const module = await load();
  return module.default as DocPage;
}
