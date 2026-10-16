/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

/** The fields of each gh procedure. */
export interface GhCommonInput {
  /** The repository as owner/name (default: the repository of the folder) */
  repo?: string | undefined;
  /** The folder where gh runs */
  cwd?: string | undefined;
  /** The time limit of the command, in milliseconds */
  timeoutMs?: number | undefined;
}

/** A list of the JSON objects that gh gives. */
export interface GhListOutput {
  items: Array<Record<string, unknown>>;
}

/** One JSON object that gh gives. */
export interface GhItemOutput {
  item: Record<string, unknown>;
}

/** What gh made: its URL. */
export interface GhCreatedOutput {
  url: string;
}

export interface GhPrListInput extends GhCommonInput {
  state?: "open" | "closed" | "merged" | "all" | undefined;
  author?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
}
export type GhPrListOutput = GhListOutput;

export interface GhPrViewInput extends GhCommonInput {
  /** The number, the branch or the URL of the pull request */
  pr: string;
}
export type GhPrViewOutput = GhItemOutput;

export interface GhPrChecksInput extends GhCommonInput {
  pr: string;
}
export type GhPrChecksOutput = GhListOutput;

export interface GhPrCreateInput extends GhCommonInput {
  title: string;
  body: string;
  base?: string | undefined;
  head?: string | undefined;
  draft?: boolean | undefined;
}
export type GhPrCreateOutput = GhCreatedOutput;

export interface GhRunListInput extends GhCommonInput {
  workflow?: string | undefined;
  branch?: string | undefined;
  status?: string | undefined;
  limit?: number | undefined;
}
export type GhRunListOutput = GhListOutput;

export interface GhRunViewInput extends GhCommonInput {
  /** The id of the run */
  run: number;
}
export type GhRunViewOutput = GhItemOutput;

export interface GhRunRerunInput extends GhCommonInput {
  run: number;
  /** Only the jobs that failed */
  failedOnly?: boolean | undefined;
}
export interface GhRunRerunOutput {
  run: number;
}

export interface GhReleaseListInput extends GhCommonInput {
  limit?: number | undefined;
}
export type GhReleaseListOutput = GhListOutput;

export interface GhReleaseViewInput extends GhCommonInput {
  /** The tag of the release (default: the latest release) */
  tag?: string | undefined;
}
export type GhReleaseViewOutput = GhItemOutput;

export interface GhIssueListInput extends GhCommonInput {
  state?: "open" | "closed" | "all" | undefined;
  label?: string | undefined;
  author?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
}
export type GhIssueListOutput = GhListOutput;

export interface GhIssueViewInput extends GhCommonInput {
  /** The number or the URL of the issue */
  issue: string;
}
export type GhIssueViewOutput = GhItemOutput;

export interface GhIssueCreateInput extends GhCommonInput {
  title: string;
  body: string;
  labels?: string[] | undefined;
}
export type GhIssueCreateOutput = GhCreatedOutput;

export interface GhIssueCommentInput extends GhCommonInput {
  /** The number or the URL of the issue or the pull request */
  issue: string;
  body: string;
}
export type GhIssueCommentOutput = GhCreatedOutput;
