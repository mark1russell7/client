/**
 * env.check procedure
 *
 * Which required environment variables are missing. The output has names only, never values.
 */

import { DEFAULT_ENV_SETTINGS, valueOf, type EnvSettings } from "../../secrets.js";
import type { EnvCheckInput, EnvCheckOutput } from "../../types.js";

/**
 * Which required environment variables are missing
 */
export async function envCheck(input: EnvCheckInput, settings: EnvSettings = DEFAULT_ENV_SETTINGS): Promise<EnvCheckOutput> {
  const source = settings.source();
  const missing: string[] = [];
  const present: string[] = [];
  for (const name of new Set(input.required)) {
    const value = valueOf(source, name);
    const has = value !== undefined && (input.allowEmpty === true || value !== "");
    (has ? present : missing).push(name);
  }
  return { ok: missing.length === 0, missing, present };
}
