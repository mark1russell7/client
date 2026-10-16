/**
 * gh.run.view procedure
 *
 * One workflow run with its jobs
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhRunViewInput, GhRunViewOutput } from "../../../types.js";
import { ghJson, repoArgs } from "../shared.js";

const FIELDS = "databaseId,workflowName,displayTitle,headBranch,headSha,event,status,conclusion,url,createdAt,updatedAt,jobs";

/**
 * One workflow run with its jobs
 */
export async function ghRunView(input: GhRunViewInput, ctx: ProcedureContext): Promise<GhRunViewOutput> {
  const args = ["run", "view", String(input.run), "--json", FIELDS, ...repoArgs(input)];
  return { item: await ghJson<Record<string, unknown>>(args, input, ctx) };
}
