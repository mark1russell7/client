/**
 * The procedures of @procedures/gh as data. Importing this file registers nothing.
 *
 * Each procedure runs the GitHub CLI (`gh`) through `shell.run`, with an argument list and no
 * shell (roadmap R42). The reads declare `reads: ["network"]`. The procedures that make or change
 * something on GitHub declare `writes: ["network"]`. `gh.run.download` writes files, so it
 * declares `writes: ["fs"]`.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/gh
 */

import { z } from "zod";
import { defineModule, registerModules, PROCEDURE_REGISTRY, type AnyProcedure, type Effects, type FsRootRules, type ProcedureModule, type ProcedureRegistry, createProcedure, zodAdapter } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import { ghPrList } from "./procedures/gh/pr/list.js";
import { ghPrView } from "./procedures/gh/pr/view.js";
import { ghPrChecks } from "./procedures/gh/pr/checks.js";
import { ghPrCreate } from "./procedures/gh/pr/create.js";
import { ghRunList } from "./procedures/gh/run/list.js";
import { ghRunView } from "./procedures/gh/run/view.js";
import { ghRunRerun } from "./procedures/gh/run/rerun.js";
import { ghReleaseList } from "./procedures/gh/release/list.js";
import { ghReleaseView } from "./procedures/gh/release/view.js";
import { ghIssueList } from "./procedures/gh/issue/list.js";
import { ghIssueView } from "./procedures/gh/issue/view.js";
import { ghIssueCreate } from "./procedures/gh/issue/create.js";
import { ghIssueComment } from "./procedures/gh/issue/comment.js";
import { ghWorkflowRun } from "./procedures/gh/workflow/run.js";
import { ghRunDownload } from "./procedures/gh/run/download.js";
import { ghApi } from "./procedures/gh/api.js";

/** A read of GitHub: it changes nothing. */
const READS: Effects = { reads: ["network"], writes: [] };
/** A write to GitHub that makes something new: not destructive, and a second call makes a second one. */
const MAKES: Effects = { reads: ["network"], writes: ["network"], destructive: false, idempotent: false };
/** A download from GitHub into files of the host. gh does not replace a file that exists, so it is not destructive. */
const DOWNLOADS: Effects = { reads: ["network"], writes: ["fs"], destructive: false, idempotent: false };
/**
 * Any call of the GitHub API. The method is an input, and a procedure that writes by an input
 * declares the writes (CAPABILITIES-2026-10, decision 14). PUT and DELETE can replace or remove
 * data, so the declaration keeps the default: destructive. The temporary file of a body is not
 * a file of the host that the call changes.
 */
const CALLS_API: Effects = { reads: ["network"], writes: ["network"] };

/**
 * The rule of each gh procedure under a root of the files (roadmap R33, tracker item O36): gh runs
 * in a working folder of the root, and its nested `shell.run` is the call of a confined procedure.
 * Under a root, the git of gh finds no repository (`runGh`), so a call gives `repo`.
 */
const IN_A_ROOT: FsRootRules = { cwd: "cwd" };

/** The rule of `gh.run.download`: the folder `dir` of the files starts at the working folder, in the root. */
const DOWNLOAD_IN_A_ROOT: FsRootRules = { cwd: "cwd", names: ["dir"] };

const common = {
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/name").optional().describe("The repository as owner/name (default: the repository of the folder)"),
  cwd: z.string().optional().describe("The folder where gh runs"),
  timeoutMs: z.number().int().min(1).optional().describe("The time limit of the command, in milliseconds"),
};
const limit = z.number().int().min(1).max(1000).optional().describe("The most items (default 30)");
const list = z.object({ items: z.array(z.record(z.string(), z.unknown())).describe("The JSON objects that gh gives") });
const item = z.object({ item: z.record(z.string(), z.unknown()).describe("The JSON object that gh gives") });
const created = z.object({ url: z.string().describe("The URL of what gh made") });

/** One procedure of this package. Each one runs gh through shell.run, and declares it. */
function gh<I, O>(
  path: string[],
  description: string,
  input: z.ZodType<I>,
  output: z.ZodType<O>,
  effects: Effects,
  handler: (input: I, ctx: Parameters<typeof ghPrList>[1]) => Promise<O>,
  args: string[] = [],
): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(zodAdapter<I>(input))
    .output(zodAdapter<O>(output))
    .meta({ description, args, shorts: {}, output: "json", effects, calls: ["shell.run"], fsRoot: path.join(".") === "gh.run.download" ? DOWNLOAD_IN_A_ROOT : IN_A_ROOT })
    .handler(handler as never)
    .build() as unknown as AnyProcedure;
}

const procedures: AnyProcedure[] = [
  gh(
    ["gh", "pr", "list"],
    "The pull requests of a repository",
    z.object({
      ...common,
      state: z.enum(["open", "closed", "merged", "all"]).optional().describe("The state (default open)"),
      author: z.string().optional().describe("Only the pull requests of this author"),
      base: z.string().optional().describe("Only the pull requests into this branch"),
      head: z.string().optional().describe("Only the pull requests from this branch"),
      search: z.string().optional().describe("A search of GitHub"),
      limit,
    }),
    list,
    READS,
    ghPrList,
  ),
  gh(["gh", "pr", "view"], "One pull request", z.object({ ...common, pr: z.string().min(1).describe("The number, the branch or the URL of the pull request") }), item, READS, ghPrView, ["pr"]),
  gh(["gh", "pr", "checks"], "The checks of a pull request", z.object({ ...common, pr: z.string().min(1).describe("The number, the branch or the URL of the pull request") }), list, READS, ghPrChecks, ["pr"]),
  gh(
    ["gh", "pr", "create"],
    "Open a pull request",
    z.object({
      ...common,
      title: z.string().min(1).describe("The title"),
      body: z.string().describe("The text of the pull request"),
      base: z.string().optional().describe("The branch to merge into (default: the default branch)"),
      head: z.string().optional().describe("The branch with the changes (default: the current branch)"),
      draft: z.boolean().optional().describe("Open it as a draft"),
    }),
    created,
    MAKES,
    ghPrCreate,
  ),
  gh(
    ["gh", "run", "list"],
    "The workflow runs of a repository",
    z.object({
      ...common,
      workflow: z.string().optional().describe("The name or the file of a workflow"),
      branch: z.string().optional().describe("Only the runs of this branch"),
      status: z.string().optional().describe("Only the runs with this status, for example completed or failure"),
      limit: z.number().int().min(1).max(1000).optional().describe("The most runs (default 20)"),
    }),
    list,
    READS,
    ghRunList,
  ),
  gh(["gh", "run", "view"], "One workflow run with its jobs", z.object({ ...common, run: z.number().int().min(1).describe("The id of the run") }), item, READS, ghRunView, ["run"]),
  gh(
    ["gh", "run", "rerun"],
    "Run a workflow run again",
    z.object({ ...common, run: z.number().int().min(1).describe("The id of the run"), failedOnly: z.boolean().optional().describe("Only the jobs that failed") }),
    z.object({ run: z.number().describe("The id of the run") }),
    MAKES,
    ghRunRerun,
    ["run"],
  ),
  gh(["gh", "release", "list"], "The releases of a repository", z.object({ ...common, limit }), list, READS, ghReleaseList),
  gh(["gh", "release", "view"], "One release: the release of a tag, or the latest release", z.object({ ...common, tag: z.string().optional().describe("The tag (default: the latest release)") }), item, READS, ghReleaseView, ["tag"]),
  gh(
    ["gh", "issue", "list"],
    "The issues of a repository",
    z.object({
      ...common,
      state: z.enum(["open", "closed", "all"]).optional().describe("The state (default open)"),
      label: z.string().optional().describe("Only the issues with this label"),
      author: z.string().optional().describe("Only the issues of this author"),
      search: z.string().optional().describe("A search of GitHub"),
      limit,
    }),
    list,
    READS,
    ghIssueList,
  ),
  gh(["gh", "issue", "view"], "One issue, with its comments", z.object({ ...common, issue: z.string().min(1).describe("The number or the URL of the issue") }), item, READS, ghIssueView, ["issue"]),
  gh(
    ["gh", "issue", "create"],
    "Open an issue",
    z.object({ ...common, title: z.string().min(1).describe("The title"), body: z.string().describe("The text of the issue"), labels: z.array(z.string()).optional().describe("The labels") }),
    created,
    MAKES,
    ghIssueCreate,
  ),
  gh(
    ["gh", "issue", "comment"],
    "Add a comment to an issue or a pull request",
    z.object({ ...common, issue: z.string().min(1).describe("The number or the URL of the issue or the pull request"), body: z.string().min(1).describe("The text of the comment") }),
    created,
    MAKES,
    ghIssueComment,
    ["issue"],
  ),
  gh(
    ["gh", "workflow", "run"],
    "Start a workflow run (a workflow_dispatch event) on a branch or a tag, with the inputs of the workflow",
    z.object({
      ...common,
      workflow: z.string().min(1).describe("The name, the file name or the id of the workflow"),
      ref: z.string().min(1).optional().describe("The branch or the tag (default: the default branch)"),
      inputs: z.record(z.string(), z.string()).optional().describe("The inputs of the workflow, each one as -f key=value"),
    }),
    z.object({
      workflow: z.string().describe("The workflow"),
      ref: z.string().optional().describe("The branch or the tag"),
      url: z.string().optional().describe("The URL of the new run, when gh prints it"),
      run: z.number().optional().describe("The id of the new run, when gh prints its URL"),
    }),
    MAKES,
    ghWorkflowRun,
    ["workflow"],
  ),
  gh(
    ["gh", "run", "download"],
    "Download the artifacts of a workflow run into a folder",
    z.object({
      ...common,
      run: z.number().int().min(1).describe("The id of the run"),
      names: z.array(z.string().min(1)).optional().describe("Only the artifacts with these names"),
      patterns: z.array(z.string().min(1)).optional().describe("Only the artifacts with names that match these glob patterns"),
      dir: z.string().min(1).optional().describe("The folder for the artifacts (default: the folder where gh runs)"),
    }),
    z.object({ run: z.number().describe("The id of the run"), dir: z.string().describe("The folder of the artifacts") }),
    DOWNLOADS,
    ghRunDownload,
    ["run"],
  ),
  gh(
    ["gh", "api"],
    "Call the GitHub API and give the parsed JSON. A method other than GET can change or delete data",
    z.object({
      ...common,
      endpoint: z.string().min(1).describe("The endpoint, for example repos/{owner}/{repo}/pulls or graphql"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("The HTTP method (default GET)"),
      fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional()
        .describe("The parameters: a string goes as -f, another value as -F. GET sends them in the query"),
      body: z.unknown().optional().describe("A JSON body, sent with --input from a temporary file"),
      paginate: z.boolean().optional().describe("Get all the pages. The pages of an array become one array"),
    }),
    z.object({ data: z.unknown().describe("The parsed JSON of the response (null when it is empty)") }),
    CALLS_API,
    ghApi,
    ["endpoint"],
  ),
];

export const ghModule: ProcedureModule = defineModule("@procedures/gh", procedures, [shellModule]);

export default ghModule;

/**
 * This function registers the procedures of @procedures/gh in a registry. The default is the
 * global registry.
 */
export function registerGhProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [ghModule]);
}
