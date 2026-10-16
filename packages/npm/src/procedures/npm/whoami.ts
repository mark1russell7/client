/**
 * npm.whoami procedure
 *
 * Give the user name of the npm registry. Without a login, npm fails, and the result has no
 * `username`.
 */

import type { ProcedureContext } from "@procedures/client";
import { accountOptions, runNpm } from "./shared.js";
import type { NpmWhoamiInput, NpmWhoamiOutput } from "../../types.js";

/**
 * Give the user name of the npm registry
 *
 * @example
 * const { username } = await client.call(["npm", "whoami"], {});
 */
export async function npmWhoami(input: NpmWhoamiInput, ctx: ProcedureContext): Promise<NpmWhoamiOutput> {
  const result: NpmWhoamiOutput = await runNpm(["whoami", ...accountOptions(input)], input, ctx);
  const username = result.stdout.trim();
  if (result.success && username) result.username = username;
  return result;
}
