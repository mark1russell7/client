/**
 * gh.pr.create procedure
 *
 * Open a pull request
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhPrCreateInput, GhPrCreateOutput } from "../../../types.js";
import { ghArg, repoArgs, runGh, urlOf } from "../shared.js";

/**
 * Open a pull request
 */
export async function ghPrCreate(input: GhPrCreateInput, ctx: ProcedureContext): Promise<GhPrCreateOutput> {
  // --title and --body take their value as the next argument, so a value that starts with "-" is text
  const args = ["pr", "create", "--title", input.title, "--body", input.body, ...repoArgs(input)];
  if (input.base !== undefined) args.push("--base", ghArg("base", input.base));
  if (input.head !== undefined) args.push("--head", ghArg("head", input.head));
  if (input.draft) args.push("--draft");
  return { url: urlOf(await runGh(args, input, ctx)) };
}
