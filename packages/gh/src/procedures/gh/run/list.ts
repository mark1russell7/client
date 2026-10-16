/**
 * gh.run.list procedure
 *
 * The workflow runs of a repository
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhRunListInput, GhRunListOutput } from "../../../types.js";
import { ghArg, ghJson, listArgs, repoArgs } from "../shared.js";

const FIELDS = "databaseId,workflowName,displayTitle,headBranch,headSha,event,status,conclusion,url,createdAt,updatedAt";

/**
 * The workflow runs of a repository
 */
export async function ghRunList(input: GhRunListInput, ctx: ProcedureContext): Promise<GhRunListOutput> {
  const args = ["run", "list", "--json", FIELDS, ...listArgs({ limit: input.limit ?? 20 }), ...repoArgs(input)];
  if (input.workflow !== undefined) args.push("--workflow", ghArg("workflow", input.workflow));
  if (input.branch !== undefined) args.push("--branch", ghArg("branch", input.branch));
  if (input.status !== undefined) args.push("--status", ghArg("status", input.status));
  return { items: await ghJson<Array<Record<string, unknown>>>(args, input, ctx) };
}
