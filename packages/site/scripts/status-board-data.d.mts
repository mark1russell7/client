// The types of status-board-data.mjs, for the TypeScript tests of the site.

import type { BoardIssue, BoardItem, BoardLink, BoardPullRequest, CheckState, StatusBoardData, StatusClass } from "../src/lib/status-board";

export declare const STATUS_CLASSES: readonly StatusClass[];
export declare const GITHUB_GRAPHQL: string;
export declare class RoadmapParseError extends Error {}

export interface MarkdownTable {
  /** The nearest heading above the table, as plain text. */
  section: string;
  /** The line of the header. */
  line: number;
  /** The header names, in lowercase plain text. */
  header: string[];
  rows: Array<{ line: number; cells: string[] }>;
}

export interface LinkOptions {
  /** The path of the roadmap file in the repository. */
  file?: string;
  /** "owner/name" of the repository. */
  repository?: string;
  /** The branch or the commit of the relative links. */
  ref?: string;
}

export type GitHubOpenWork =
  | { available: true; pullRequests: BoardPullRequest[]; issues: BoardIssue[]; totals: { pullRequests: number; issues: number } }
  | { available: false; reason: string };

export declare function statusClassOf(text: string | null | undefined): StatusClass;
export declare function splitRow(line: string): string[];
export declare function plainText(markdown: string | null | undefined): string;
export declare function markdownTables(markdown: string): MarkdownTable[];
export declare function linksOf(cell: string | null | undefined, options?: LinkOptions): BoardLink[];
export declare function roadmapItems(markdown: string, options?: LinkOptions): BoardItem[];
export declare function checkStateOf(rollup: { state?: string } | null | undefined): CheckState;
export declare function githubOpenWork(options: {
  owner: string;
  repo: string;
  token: string | undefined;
  fetch?: typeof fetch;
  endpoint?: string;
  first?: number;
  timeoutMs?: number;
}): Promise<GitHubOpenWork>;
export declare function buildStatusBoard(options: {
  items: BoardItem[];
  github: GitHubOpenWork;
  roadmap: string;
  repository: string;
  commit?: string | null;
  generatedAt?: string;
}): StatusBoardData;
export declare function readStatusBoard(options: {
  repoDir: string;
  roadmap: string;
  owner: string;
  repo: string;
  token: string | undefined;
  commit?: string | null;
  fetch?: typeof fetch;
  generatedAt?: string;
}): Promise<StatusBoardData>;
