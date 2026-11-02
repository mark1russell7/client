/**
 * Procedure modules and explicit registries (architecture review, roadmap 3.1).
 *
 * Importing a package registers nothing (ARCHITECTURE-PROPOSALS-2026-10, P9). A host with its own
 * registry gives it the module of each package: the `./module` entry exports the procedures as
 * data. The global `PROCEDURE_REGISTRY` gets the procedures of a package from its `./register`
 * entry (`import "@procedures/git/register"`).
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

import { PROCEDURE_REGISTRY, ProcedureRegistry, RegistryError, type RegistryResolver } from "./registry.js";
import { coreProcedures } from "./core/index.js";
import { metaProcedures as definitionProcedures } from "./define-procedure.js";
import { pathToKey, type AnyProcedure, type ProcedureModule, type ProcedurePath, type RegistrationOptions } from "./types.js";

/**
 * The procedures of `@procedures/client`: the control flow (`client.chain`, `client.map` and the
 * others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` always registers this
 * module. `import "@procedures/client/register"` registers it in the global registry.
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

/** The module of a package and the function that registers it. `definePackage` gives one. */
export interface PackageDefinition {
  /** The module: the procedures as data. The `./module` entry of the package exports it. */
  readonly module: ProcedureModule;
  /**
   * This function registers the procedures of the module, and of the modules that it uses, in a
   * registry. The default is the global registry. The `./register` entry of the package starts it.
   */
  readonly register: (registry?: ProcedureRegistry) => void;
}

/**
 * This function gives the module of a package and its `register` function. The call registers
 * nothing, so the `./module` entry of a package can use it.
 *
 * ```ts
 * // src/module.ts
 * const vitest: PackageDefinition = definePackage("@procedures/vitest", [vitestRunProcedure]);
 * export const vitestModule: ProcedureModule = vitest.module;
 * export const registerVitestProcedures: PackageDefinition["register"] = vitest.register;
 * ```
 */
export function definePackage(
  name: string,
  procedures: readonly AnyProcedure[],
  requires: readonly ProcedureModule[] = []
): PackageDefinition {
  const module = defineModule(name, procedures, requires);
  const register = (registry: ProcedureRegistry = PROCEDURE_REGISTRY): void => {
    registerModules(registry, [module]);
  };
  return { module, register };
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
          `Two modules give the procedure ${pathToKey(path)}: the second one is ${module.name ?? "a module without a name"}`,
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

/** The options of `createLazyRegistry()` (roadmap O93). */
export interface LazyRegistryOptions {
  /** The modules that the registry registers at once, after `clientModule`: the core procedures. */
  readonly modules?: readonly ModuleInput[] | undefined;
  /**
   * The index: the key of each path (`pathToKey()`) and the names of the packages that give it.
   * Two packages can give one path.
   */
  readonly index: Readonly<Record<string, readonly string[]>>;
  /** This function gives the module of a package, or undefined for a package without a build. */
  readonly load: (name: string) => Promise<ProcedureModule | undefined>;
  /**
   * The names of all packages, in the order of the eager load. `loadAll()` loads them in this
   * order. The default is the names of the index.
   */
  readonly packages?: readonly string[] | undefined;
  /** This function gets each warning. The default is `console.warn`. */
  readonly warn?: ((message: string) => void) | undefined;
}

/** The first line of the message of an error. */
function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
}

/**
 * This function makes a lazy registry (roadmap O93). The registry has the procedures of
 * `clientModule` and of `options.modules` at once. A miss of `resolve()` loads only the packages
 * that the index names for the path.
 *
 * - Concurrent resolves of one package start one load.
 * - A path that is not in the index loads each package, with one warning for each path.
 * - A package that did not load gives a warning. The resolve of a path that is still missing
 *   then rejects with a `RegistryError`, with the load error as its `cause`. A later resolve tries
 *   that package again.
 * - The registration goes through `registerModules()`: the modules that a module requires come
 *   with it, and the same handler from two modules registers one time.
 * - `loadAll()` loads each package in the order of `options.packages`.
 */
export function createLazyRegistry(options: LazyRegistryOptions): ProcedureRegistry {
  const warn = options.warn ?? ((message: string): void => console.warn(message));
  const packages = options.packages ?? [...new Set(Object.values(options.index).flat())];
  const loaded = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();
  const warnedPaths = new Set<string>();

  function loadPackage(name: string): Promise<void> {
    if (loaded.has(name)) return Promise.resolve();
    const current = inFlight.get(name);
    if (current) return current;
    const started = (async (): Promise<void> => {
      const module = await options.load(name);
      if (module) registerModules(registry, [module]);
    })();
    inFlight.set(name, started);
    // A failure is not recorded as a load: the next resolve tries the package again
    started.then(
      () => {
        loaded.add(name);
        inFlight.delete(name);
      },
      (error: unknown) => {
        inFlight.delete(name);
        warn(`the procedures of ${name} did not load: ${firstLine(error)}`);
      },
    );
    return started;
  }

  const resolver: RegistryResolver = {
    async resolve(path: ProcedurePath): Promise<void> {
      const key = pathToKey(path);
      const named = Object.hasOwn(options.index, key) ? options.index[key] : undefined;
      let targets: readonly string[];
      if (named !== undefined && named.length > 0) {
        targets = named;
      } else {
        if (!warnedPaths.has(key)) {
          warnedPaths.add(key);
          warn(`the index has no package for ${key}: each package loads`);
        }
        targets = packages;
      }
      let failure: { name: string; error: unknown } | undefined;
      // One package after the other, in the order of the index: the order of the eager load
      for (const name of targets) {
        try {
          await loadPackage(name);
        } catch (error) {
          failure ??= { name, error };
        }
      }
      if (failure === undefined || registry.has(path)) return;
      const cause = failure.error instanceof Error ? failure.error : new Error(String(failure.error));
      throw new RegistryError(`The procedure ${key} did not load: the package ${failure.name} did not load: ${firstLine(cause)}`, path, cause);
    },
    async loadAll(): Promise<void> {
      for (const name of packages) {
        try {
          await loadPackage(name);
        } catch {
          // loadPackage() gave the warning. The other packages still load, as in the eager load.
        }
      }
    },
  };

  const registry = new ProcedureRegistry({ resolver });
  return registerModules(registry, [clientModule, ...(options.modules ?? [])]);
}

/**
 * This function registers the procedures of `clientModule` in a registry: the global registry by
 * default. A procedure that the registry has already stays. The `./register` entry of the package
 * starts this function.
 */
export function registerClientProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  for (const procedure of clientModule.procedures) {
    if (!registry.has(procedure.path)) registry.register(procedure);
  }
}
