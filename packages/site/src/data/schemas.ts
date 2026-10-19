/**
 * The input and output schemas of the procedures. `scripts/gen-data.mjs` writes one module for
 * each package, so the page of a procedure loads only the schemas of its package. No other page
 * loads a schema: the main bundle has the procedures without their schemas (`index.ts`).
 *
 * Only the procedures page imports this module. The build plugin does not import it: it runs in
 * Node, where `import.meta.glob` does not exist.
 */

import { procedureByKey, type ProcedureInfo, type ProcedureSchemas } from "./index";

/** The schemas of one procedure, as the module of its package holds them. */
interface SchemaEntry extends ProcedureSchemas {
  key: string;
}

/** The module of each package, by its file: "./generated/schemas/client-git.js". */
const modules = import.meta.glob<{ default: unknown }>("./generated/schemas/*.js");

/**
 * This function loads the schemas of the procedure at a key, and gives the procedure with them.
 * It gives undefined when no procedure has the key. It throws when the data has no schemas for
 * the procedure.
 */
export async function loadProcedure(key: string): Promise<ProcedureInfo | undefined> {
  const summary = procedureByKey(key);
  if (!summary) return undefined;
  const load = modules[`./generated/schemas/${summary.package}.js`];
  if (!load) throw new Error(`The site data has no schemas for the package ${summary.package}.`);
  const entries = (await load()).default as SchemaEntry[];
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`The site data has no schemas for the procedure ${key}.`);
  return { ...summary, input: entry.input, output: entry.output };
}
