/**
 * The storage procedures report only what they did (deep dive CORE-16, DATA-10). Without a
 * store they fail with NOT_CONFIGURED. With a store they work on it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { InMemoryStorage } from "@mark1russell7/client-collections";
import { PROCEDURE_REGISTRY } from "../registry.js";
import { invokeProcedure, outputValue } from "../invoke.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "../core/schemas.js";
import type { AnyProcedure, ProcedurePath } from "../types.js";
import {
  procedureRegisterProcedure,
  procedureStoreProcedure,
  procedureLoadProcedure,
  procedureSyncProcedure,
  procedureRemoteProcedure,
} from "./procedures.js";
import { SyncedProcedureRegistry, getProcedureStore } from "./synced-registry.js";
import type { HandlerLoader, SerializedProcedure } from "./types.js";

async function run(procedure: AnyProcedure, input: unknown): Promise<any> {
  return outputValue(await invokeProcedure(procedure, input));
}

const added: ProcedurePath[] = [];
afterEach(() => {
  for (const path of added.splice(0)) PROCEDURE_REGISTRY.unregister(path);
});

describe("without a store", () => {
  it("store, load, sync and register with persist fail with NOT_CONFIGURED", async () => {
    expect(getProcedureStore(PROCEDURE_REGISTRY)).toBeUndefined();
    await expect(run(procedureStoreProcedure, { path: ["procedure", "list"] })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(run(procedureLoadProcedure, { all: true })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(run(procedureSyncProcedure, {})).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(
      run(procedureRegisterProcedure, { path: ["cb16", "persisted"], persist: true, handlerRef: { module: "m", export: "e" } })
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(PROCEDURE_REGISTRY.has(["cb16", "persisted"])).toBe(false);
  });

  it("remote status says that there is no store, and connect is not implemented", async () => {
    await expect(run(procedureRemoteProcedure, { action: "status" })).resolves.toMatchObject({ connected: false });
    await expect(run(procedureRemoteProcedure, { action: "connect", endpoint: "http://x" })).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
  });

  it("register with no persist declares a procedure with no handler, and says so", async () => {
    added.push(["cb16", "declared"]);
    const result = await run(procedureRegisterProcedure, { path: ["cb16", "declared"] });
    expect(result).toMatchObject({ success: true, hasHandler: false });
    expect(PROCEDURE_REGISTRY.get(["cb16", "declared"])?.handler).toBeUndefined();
  });
});

describe("with a store", () => {
  const loader: HandlerLoader = {
    load: async (ref) => (ref.module === "@cb16/handlers" ? async () => `loaded ${ref.export}` : undefined),
  };

  async function withStore(test: (store: SyncedProcedureRegistry) => Promise<void>): Promise<void> {
    const store = new SyncedProcedureRegistry(PROCEDURE_REGISTRY, new InMemoryStorage<SerializedProcedure>(), {
      writeStrategy: "write-back",
      handlerLoader: loader,
    });
    try {
      await test(store);
    } finally {
      await store.close();
    }
    expect(getProcedureStore(PROCEDURE_REGISTRY)).toBeUndefined();
  }

  it("store writes the record", async () => {
    await withStore(async (store) => {
      added.push(["cb16", "stored"]);
      PROCEDURE_REGISTRY.register(
        defineProcedure({ path: ["cb16", "stored"], input: outputSchema(), output: outputSchema(), handler: async () => 1 })
      );
      const result = await run(procedureStoreProcedure, { path: "cb16.stored", handlerRef: { module: "@cb16/handlers", export: "x" } });
      expect(result).toMatchObject({ stored: true });
      expect((await store.getAdapter().getRaw(["cb16", "stored"]))?.handlerRef).toEqual({ module: "@cb16/handlers", export: "x" });
    });
  });

  it("load adds the stored records to the registry, with their handlers", async () => {
    await withStore(async (store) => {
      added.push(["cb16", "loaded"]);
      await store.getAdapter().getStorage().set("cb16.loaded", {
        path: ["cb16", "loaded"],
        metadata: {},
        handlerRef: { module: "@cb16/handlers", export: "y" },
        storedAt: Date.now(),
      });
      const result = await run(procedureLoadProcedure, { prefix: ["cb16"] });
      expect(result).toMatchObject({ loaded: 1, paths: [["cb16", "loaded"]] });
      expect(await outputValue(await invokeProcedure(PROCEDURE_REGISTRY.get(["cb16", "loaded"])!, {}))).toBe("loaded y");
    });
  });

  it("register with persist stores a procedure only with a handler", async () => {
    await withStore(async (store) => {
      added.push(["cb16", "persisted"]);
      await expect(run(procedureRegisterProcedure, { path: ["cb16", "nohandler"], persist: true })).rejects.toMatchObject({
        code: "NO_HANDLER",
      });
      expect(PROCEDURE_REGISTRY.has(["cb16", "nohandler"])).toBe(false);

      const result = await run(procedureRegisterProcedure, {
        path: ["cb16", "persisted"],
        persist: true,
        handlerRef: { module: "@cb16/handlers", export: "z" },
      });
      expect(result).toMatchObject({ success: true, hasHandler: true });
      await store.flushPending();
      expect(await store.getAdapter().has(["cb16", "persisted"])).toBe(true);
    });
  });

  it("sync pushes the registry", async () => {
    await withStore(async (store) => {
      const result = await run(procedureSyncProcedure, { direction: "push" });
      expect(result.pushed).toBe(PROCEDURE_REGISTRY.size);
      expect(await store.getAdapter().size()).toBe(PROCEDURE_REGISTRY.size);
    });
  });
});
