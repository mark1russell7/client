/**
 * gh.pr.checks procedure
 *
 * The checks of a pull request. gh exits with 8 while a check runs: that is a result, not a failure.
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhPrChecksInput, GhPrChecksOutput } from "../../../types.js";
import { GhError, ghArg, ghJson, repoArgs } from "../shared.js";

/**
 * The checks of a pull request
 */
export async function ghPrChecks(input: GhPrChecksInput, ctx: ProcedureContext): Promise<GhPrChecksOutput> {
  const args = ["pr", "checks", ghArg("pr", input.pr), "--json", "name,state,bucket,link,workflow", ...repoArgs(input)];
  try {
    return { items: await ghJson<Array<Record<string, unknown>>>(args, input, ctx) };
  } catch (error) {
    // Exit 8: a check is pending. gh still prints the JSON on stdout, but runGh threw on the exit code
    if (error instanceof GhError && error.exitCode === 8) {
      throw new GhError("gh pr checks: a check is pending, ask again later", 8, error.stderr);
    }
    throw error;
  }
}
