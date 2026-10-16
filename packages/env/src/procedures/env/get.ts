/**
 * env.get procedure
 *
 * One environment variable. A secret is masked unless the host reveals it: the output then says
 * that the variable is set, and it has no value.
 */

import { DEFAULT_ENV_SETTINGS, valueOf, type EnvSettings } from "../../secrets.js";
import type { EnvGetInput, EnvGetOutput } from "../../types.js";

/**
 * One environment variable. A secret is masked unless the host reveals it
 */
export async function envGet(input: EnvGetInput, settings: EnvSettings = DEFAULT_ENV_SETTINGS): Promise<EnvGetOutput> {
  const value = valueOf(settings.source(), input.name);
  const secret = settings.isSecret(input.name);
  const set = value !== undefined;
  const masked = set && secret && !settings.reveals(input.name);
  return {
    name: input.name,
    set,
    secret,
    masked,
    ...(set && !masked ? { value } : {}),
  };
}
