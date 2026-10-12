// The types of docs-data.mjs, for the tests.

export const REPOSITORY_URL: string;
export const SITE_NAME: string;
export const SITE_URL: string;
export const BASE_MARKER: string;
export const RUNNABLE_LIMIT: number;

export interface LinkTarget {
  href: string;
  external: boolean;
}

export interface ConvertedHeading {
  id: string;
  text: string;
  depth: number;
}

export type ConvertedSegment =
  | { type: "html"; html: string }
  | { type: "program"; html: string; program: unknown; runnable: boolean; expected?: string };

export interface ConvertedDoc {
  title: string | null;
  description: string;
  toc: ConvertedHeading[];
  segments: ConvertedSegment[];
  programs: number;
}

export function escapeHtml(text: string): string;
export function plainText(markdown: string): string;
export function clip(text: string, limit?: number): string;
export function createSlugger(): (text: string) => string;
export function highlightCode(code: string, language: string): string;
export function programOf(code: string): { program: Record<string, unknown>; expected: string } | null;
export function programKeys(value: unknown, keys?: Set<string>): Set<string>;
export function convertMarkdown(
  markdown: string,
  options?: { resolveLink?: (href: string) => LinkTarget; canRun?: (key: string) => boolean },
): ConvertedDoc;

export interface DocSource {
  slug: string;
  file: string;
  path: string;
  section: string;
  seoTitle?: string;
  package?: { dir: string; name: string; description?: string };
}

export function docSources(packagesDir: string, packages: Array<{ dir: string; name: string; description?: string }>): DocSource[];
export function linkResolver(options: { file: string; repoRoot: string; docsByPath: Map<string, string> }): (href: string) => LinkTarget;

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

export function readDocs(
  packagesDir: string,
  packages: Array<{ dir: string; name: string; description?: string }>,
  options?: { canRun?: (key: string) => boolean },
): {
  index: DocsIndexEntry[];
  routes: Array<{ slug: string; heading: string; title: string }>;
  pages: Record<string, { slug: string; toc: ConvertedHeading[]; segments: ConvertedSegment[] }>;
  search: Array<{ slug: string; title: string; headings: Array<{ id: string; text: string }> }>;
};

export function docModuleName(slug: string): string;
