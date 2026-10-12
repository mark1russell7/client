/**
 * Procedure modules and explicit registries (architecture review, roadmap 3.1).
 *
 * Importing a package root registers its procedures in the global `PROCEDURE_REGISTRY`
 * (DECISIONS-2026-10, "Every package root registers its procedures"). That stays. A host that
 * wants its own registry uses the module of each package instead: the `./module` entry of a
 * package exports its procedures as data, and importing it registers nothing.
 *
 * ```ts
 * import { createRegistry, Client, LocalTransport } from "@procedures/client";
 * import gitModule from "@procedures/git/module";
 *
 * const registry = createRegistry(gitModule);
 * const client = new Client(new LocalTransport({ registry })).useRegistry(registry);
 * ```
 *
 * Two registries in one process stay apart: a nested call, `procedure.define` and the expose
 * rule of a server all use the registry of the invocation (`ctx.registry`).
 */

import { ProcedureRegistry, RegistryError } from "./registry.js";
import { coreProcedures } from "./core/index.js";
import { metaProcedures as definitionProcedures } from "./define-procedure.js";
import type { AnyProcedure, ProcedureModule, RegistrationOptions } from "./types.js";

/**
 * The procedures that `@procedures/client` registers in the global registry when it is
 * imported: the control flow (`client.chain`, `client.map` and the others) and
 * `procedure.define`/`get`/`list`/`delete`. `createRegistry()` always registers this module, so an
 * explicit registry has what the global registry has.
 */
export const clientModule: ProcedureModule = {
  name: "@procedures/client",
  procedures: [...coreProcedures, ...definitionProcedures],
};

/** This function gives a module: its procedures, and the modules whose procedures it calls. */
export function defineModule(
  name: string,
  procedures: readonly AnyProcedure[],
  requires: readonly ProcedureModule[] = []
): ProcedureModule {
  return { name, procedures: [...procedures], requires };
}

/**
 * The modules and their required modules, each one time, with each required module before the
 * module that requires it.
 */
export function moduleClosure(modules: readonly ProcedureModule[]): ProcedureModule[] {
  const ordered: ProcedureModule[] = [];
  const seen = new Set<ProcedureModule>();
  const names = new Set<string>();
  const visit = (module: ProcedureModule, trail: readonly ProcedureModule[]): void => {
    if (seen.has(module)) return;
    // Two copies of one package (two installs) have one name: the first one counts
    if (module.name !== undefined && names.has(module.name)) return;
    if (trail.includes(module)) {
      throw new Error(`Modules require each other in a cycle: ${[...trail, module].map((m) => m.name ?? "?").join(" -> ")}`);
    }
    for (const required of module.requires ?? []) visit(required, [...trail, module]);
    seen.add(module);
    if (module.name !== undefined) names.add(module.name);
    ordered.push(module);
  };
  for (const module of modules) visit(module, []);
  return ordered;
}

/** One module, or a list of modules (a bundle can give a list). */
export type ModuleInput = ProcedureModule | readonly ProcedureModule[];

/**
 * Register the procedures of a module and of its required modules in a registry. A procedure
 * that the registry has already (the same handler, from a module that two modules require) is
 * skipped. Another procedure at the same path is an error.
 */
export function registerModules(
  registry: ProcedureRegistry,
  modules: readonly ModuleInput[],
  options?: RegistrationOptions
): ProcedureRegistry {
  const flat = modules.flatMap((input) => (Array.isArray(input) ? (input as readonly ProcedureModule[]) : [input as ProcedureModule]));
  for (const module of moduleClosure(flat)) {
    for (const procedure of module.procedures) {
      const path = options?.pathPrefix ? [...options.pathPrefix, ...procedure.path] : procedure.path;
      const existing = registry.get(path);
      if (existing && !options?.override) {
        if (existing.handler === procedure.handler) continue;
        throw new RegistryError(
          `Two modules give the procedure ${path.join(".")}: the second one is ${module.name ?? "a module without a name"}`,
          path
        );
      }
      registry.register(procedure, options);
    }
  }
  return registry;
}

/**
 * A new registry with the procedures of `clientModule` (what the global registry has after
 * `import "@procedures/client"`) and of each module, with their required modules.
 */
export function createRegistry(...modules: ModuleInput[]): ProcedureRegistry {
  return registerModules(new ProcedureRegistry(), [clientModule, ...modules]);
}
