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

export interface GhWorkflowRunInput extends GhCommonInput {
  /** The name, the file name or the id of the workflow */
  workflow: string;
  /** The branch or the tag to run the workflow on (default: the default branch) */
  ref?: string | undefined;
  /** The inputs of the workflow. Each one goes to gh as `-f key=value`. */
  inputs?: Record<string, string> | undefined;
}
export interface GhWorkflowRunOutput {
  workflow: string;
  ref?: string | undefined;
  /** The URL of the new run, when gh prints it */
  url?: string | undefined;
  /** The id of the new run, when gh prints its URL */
  run?: number | undefined;
}

export interface GhRunDownloadInput extends GhCommonInput {
  /** The id of the run */
  run: number;
  /** Only the artifacts with these names */
  names?: string[] | undefined;
  /** Only the artifacts with names that match these glob patterns */
  patterns?: string[] | undefined;
  /** The folder for the artifacts (default: the folder where gh runs) */
  dir?: string | undefined;
}
export interface GhRunDownloadOutput {
  run: number;
  /** The folder of the artifacts */
  dir: string;
}

/** A value of a field of gh.api. A string goes as `-f`, another value as `-F` (gh converts its type). */
export type GhApiFieldValue = string | number | boolean | null;

/** The HTTP methods of gh.api. */
export type GhApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface GhApiInput extends GhCommonInput {
  /** The endpoint, for example `repos/{owner}/{repo}/pulls` or `graphql` */
  endpoint: string;
  /** The HTTP method (default GET) */
  method?: GhApiMethod | undefined;
  /** The parameters. GET sends them in the query, the other methods in the JSON body. */
  fields?: Record<string, GhApiFieldValue> | undefined;
  /** A JSON body. gh reads it from a temporary file (`--input`). */
  body?: unknown;
  /** Get all the pages of the result */
  paginate?: boolean | undefined;
}
export interface GhApiOutput {
  /** The parsed JSON of the response. An empty response gives null. */
  data: unknown;
}

