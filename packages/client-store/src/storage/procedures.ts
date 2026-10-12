/**
 * procedure.register: register a procedure at run time, from a handler reference.
 *
 * With `persist`, the procedure goes into the store of a synced registry (`createSyncedRegistry()`),
 * and only with a handler that the store's loader allows: never a stub (deep dive CORE-16). Without
 * a store, `persist` fails with the code NOT_CONFIGURED.
 *
 * The programs of `procedure.define` have their own store: `procedure.store`, `load` and `sync`
 * (../program-store/procedures.ts, roadmap 3.2).
 */

import { defineProcedure } from "@procedures/client";
import type { AnyProcedure, ProcedureContext, ProcedurePath } from "@procedures/client";
import { PROCEDURE_REGISTRY, type ProcedureRegistry } from "@procedures/client";
import { pathToKey } from "@procedures/client";
import type { HandlerReference, SerializedProcedure } from "./types.js";
import { deserializeProcedure, deserializeProcedureSync } from "./serialization.js";
import { getProcedureStore, type SyncedProcedureRegistry } from "./synced-registry.js";
import { ProcedureStoreError } from "../errors.js";

// =============================================================================
// Any Schema Helper
// =============================================================================

const anySchema: {
  parse: (data: unknown) => unknown;
  safeParse: (data: unknown) => { success: true; data: unknown };
  _output: unknown;
} = {
  parse: (data: unknown) => data,
  safeParse: (data: unknown) => ({ success: true as const, data }),
  _output: undefined as unknown,
};

// =============================================================================
// The store of the caller
// =============================================================================

export { ProcedureStoreError } from "../errors.js";

/** The registry of the caller: the context's registry when it has one, else the global one. */
function callerRegistry(ctx: ProcedureContext | undefined): ProcedureRegistry {
  return (ctx as (ProcedureContext & { registry?: ProcedureRegistry }) | undefined)?.registry ?? PROCEDURE_REGISTRY;
}

/** The store of the caller's registry, or a NOT_CONFIGURED error. */
function requireStore(ctx: ProcedureContext | undefined, what: string): SyncedProcedureRegistry {
  const store = getProcedureStore(callerRegistry(ctx));
  if (!store) {
    throw new ProcedureStoreError(
      "NOT_CONFIGURED",
      `${what} needs a procedure store, and this registry has none. ` +
        "Wrap the registry with createSyncedRegistry() or new SyncedProcedureRegistry()."
    );
  }
  return store;
}


// =============================================================================
// procedure.register - Register procedure at runtime
// =============================================================================

interface RegisterInput {
  /** Procedure path */
  path: ProcedurePath;
  /** Procedure metadata */
  metadata?: Record<string, unknown>;
  /** Whether procedure supports streaming */
  streaming?: boolean;
  /** Handler reference for loading */
  handlerRef?: HandlerReference;
  /** Whether to persist to storage */
  persist?: boolean;
}

interface RegisterOutput {
  success: boolean;
  message: string;
  path: ProcedurePath;
  /** False for a declaration: the procedure has no handler, and a Client sends its calls to the transport */
  hasHandler: boolean;
}

export const procedureRegisterProcedure: AnyProcedure = defineProcedure({
  path: ["procedure", "register"],
  input: anySchema as any,
  output: anySchema as any,
  metadata: {
    description: "Register a procedure at runtime",
    tags: ["procedure", "registry", "storage"],
  },
  handler: async (input: RegisterInput, ctx: ProcedureContext): Promise<RegisterOutput> => {
    const { path, metadata = {}, streaming, handlerRef, persist = false } = input;
    const key = pathToKey(path);
    const serialized: SerializedProcedure = {
      path,
      metadata,
      streaming,
      handlerRef,
      storedAt: Date.now(),
    };

    if (persist) {
      // A stored procedure needs a handler: never store a stub (deep dive CORE-16)
      const store = requireStore(ctx, "procedure.register with persist");
      const loader = store.getHandlerLoader();
      const procedure = handlerRef && loader ? await deserializeProcedure(serialized, { handlerLoader: loader }) : undefined;
      if (!procedure?.handler) {
        throw new ProcedureStoreError(
          "NO_HANDLER",
          `procedure.register with persist needs a handler for ${key}: give a handlerRef ` +
            "that the handler loader of the store allows."
        );
      }
      store.register(procedure, { override: false, handlerRef });
      await store.flushWrites();
      return { success: true, message: `Registered and stored ${key}`, path, hasHandler: true };
    }

    // No persist: load the handler when the store's loader allows it, else declare a stub
    const loader = getProcedureStore(callerRegistry(ctx))?.getHandlerLoader();
    const procedure =
      handlerRef && loader ? await deserializeProcedure(serialized, { handlerLoader: loader }) : deserializeProcedureSync(serialized);
    try {
      callerRegistry(ctx).register(procedure, { override: false });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
        path,
        hasHandler: false,
      };
    }

    const hasHandler = typeof procedure.handler === "function";
    return {
      success: true,
      message: hasHandler
        ? `Registered ${key}`
        : `Registered ${key} with no handler: a Client sends the calls of this path to its transport`,
      path,
      hasHandler,
    };
  },
});
