/**
 * The program store of a registry.
 *
 * A host gives a registry its store with `attachProgramStore(registry, store)`. The procedures
 * `procedure.store`, `load` and `sync` use the store of the caller's registry (`ctx.registry`,
 * or the global registry). Without a store, they fail with the code NOT_CONFIGURED.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext, type ProcedureRegistryLike } from "@mark1russell7/client";
import type { ProgramStore } from "./types.js";
import { ProcedureStoreError } from "../storage/procedures.js";

const STORES = new WeakMap<object, ProgramStore>();

/** Give a registry its program store. A second call replaces the store. */
export function attachProgramStore(registry: object, store: ProgramStore): void {
  STORES.set(registry, store);
}

/** Take the program store from a registry. */
export function detachProgramStore(registry: object): void {
  STORES.delete(registry);
}

/** The program store of a registry, or undefined. */
export function getProgramStore(registry: object): ProgramStore | undefined {
  return STORES.get(registry);
}

/** The registry of a caller: the context's registry, or the global registry. */
export function callerRegistry(ctx: ProcedureContext | undefined): ProcedureRegistryLike {
  return ctx?.registry ?? PROCEDURE_REGISTRY;
}

/** The program store of the caller's registry, or a NOT_CONFIGURED error. */
export function requireProgramStore(ctx: ProcedureContext | undefined, what: string): ProgramStore {
  const store = getProgramStore(callerRegistry(ctx));
  if (!store) {
    throw new ProcedureStoreError(
      "NOT_CONFIGURED",
      `${what} needs a program store, and this registry has none. ` +
        "Give it one with attachProgramStore(registry, new FileProgramStore(path)) (or MemoryProgramStore, CollectionProgramStore)."
    );
  }
  return store;
}
