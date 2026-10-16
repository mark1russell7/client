/**
 * env.list procedure
 *
 * The names of the environment variables, never the values of the secrets. With `values: true`,
 * the output has the values of the other variables. The reveal rule of the host does not apply
 * here: a list never shows a secret.
 */

import { DEFAULT_ENV_SETTINGS, type EnvSettings } from "../../secrets.js";
import type { EnvListEntry, EnvListInput, EnvListOutput } from "../../types.js";

/**
 * The names of the environment variables, never the values of the secrets
 */
export async function envList(input: EnvListInput, settings: EnvSettings = DEFAULT_ENV_SETTINGS): Promise<EnvListOutput> {
  const source = settings.source();
  const prefix = input.prefix?.toUpperCase();
  const variables: EnvListEntry[] = [];
  for (const [name, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    if (prefix !== undefined && !name.toUpperCase().startsWith(prefix)) continue;
    const secret = settings.isSecret(name);
    variables.push({ name, secret, ...(input.values === true && !secret ? { value } : {}) });
  }
  variables.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { variables };
}
