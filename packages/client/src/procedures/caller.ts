/**
 * A caller of the procedures of some modules (`callerOf`). An app that calls the procedures of a
 * package in its own process repeats three steps: a registry of the module, `invokePath` and
 * `outputValue`. A caller does the three steps in one call. jarvis had four copies of them.
 */

import type { ProcedurePath } from "./types.js";
import type { ProcedureRegistry } from "./registry.js";
import { invokePath, outputValue, type InvokeOptions } from "./invoke.js";
import { createRegistry, type ModuleInput } from "./module.js";

/** The options of one call of a caller: the options of `invokePath` without the registry. */
export type CallerOptions = Omit<InvokeOptions, "registry">;

/** A function that runs the procedures of its modules (`callerOf`). */
export interface Caller {
  /**
   * This function runs the procedure at `path` with `input`, and gives one value: the value of
   * the procedure, or the last item of its stream. An empty stream rejects with `NO_OUTPUT`, and
   * a path that the modules do not have rejects with `NOT_FOUND`.
   */
  <T = unknown>(path: ProcedurePath, input: unknown, options?: CallerOptions): Promise<T>;
  /** The registry of the caller: `clientModule` and the modules, with their required modules. The first use makes it. */
  readonly registry: ProcedureRegistry;
}

/**
 * This function makes a caller of the procedures of the modules. The registry of the modules is
 * made at the first call, so a caller costs nothing until it calls. The caller does not use the
 * global registry.
 *
 * @example
 * const gh = callerOf(ghModule);
 * const runs = await gh<RunList>(["gh", "run", "list"], { repo: "owner/name" });
 */
export function callerOf(...modules: ModuleInput[]): Caller {
  let registry: ProcedureRegistry | undefined;
  const registryOf = (): ProcedureRegistry => (registry ??= createRegistry(...modules));
  const call = async <T = unknown>(path: ProcedurePath, input: unknown, options: CallerOptions = {}): Promise<T> => {
    const output = await invokePath<T>(path, input, { ...options, registry: registryOf() });
    return outputValue(output, path);
  };
  Object.defineProperty(call, "registry", { get: registryOf, enumerable: true });
  return call as Caller;
}
