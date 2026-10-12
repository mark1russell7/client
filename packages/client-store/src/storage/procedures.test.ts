/**
 * procedure.register reports only what it did (deep dive CORE-16, DATA-10). With `persist` and
 * no synced registry it fails with NOT_CONFIGURED, and it never stores a procedure with no
 * handler. The procedures of the program store have their own tests
 * (../program-store/procedures.test.ts).
 */

import { describe, it, expect, afterEach } from "vitest";
import { InMemoryStorage } from "@procedures/collections";
import { PROCEDURE_REGISTRY, invokeProcedure, outputValue } from "@procedures/client";
import type { AnyProcedure, ProcedurePath } from "@procedures/client";
import { procedureRegisterProcedure } from "./procedures.js";
import { SyncedProcedureRegistry, getProcedureStore } from "./synced-registry.js";
import type { HandlerLoader, SerializedProcedure } from "./types.js";

async function run(procedure: AnyProcedure, input: unknown): Promise<any> {
  return outputValue(await invokeProcedure(procedure, input));
}

const added: ProcedurePath[] = [];
afterEach(() => {
  for (const path of added.splice(0)) PROCEDURE_REGISTRY.unregister(path);
});

describe("procedure.register without a synced registry", () => {
  it("fails with NOT_CONFIGURED for persist, and registers nothing", async () => {
    expect(getProcedureStore(PROCEDURE_REGISTRY)).toBeUndefined();
    await expect(
      run(procedureRegisterProcedure, { path: ["cb16", "persisted"], persist: true, handlerRef: { module: "m", export: "e" } })
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(PROCEDURE_REGISTRY.has(["cb16", "persisted"])).toBe(false);
  });

  it("with no persist declares a procedure with no handler, and says so", async () => {
    added.push(["cb16", "declared"]);
    const result = await run(procedureRegisterProcedure, { path: ["cb16", "declared"] });
    expect(result).toMatchObject({ success: true, hasHandler: false });
    expect(PROCEDURE_REGISTRY.get(["cb16", "declared"])?.handler).toBeUndefined();
  });
});

describe("procedure.register with a synced registry", () => {
  const loader: HandlerLoader = {
    load: async (ref) => (ref.module === "@cb16/handlers" ? async () => `loaded ${ref.export}` : undefined),
  };

  it("stores a procedure only with a handler that the loader allows", async () => {
    const store = new SyncedProcedureRegistry(PROCEDURE_REGISTRY, new InMemoryStorage<SerializedProcedure>(), {
      writeStrategy: "write-back",
      handlerLoader: loader,
    });
    try {
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
      expect(await outputValue(await invokeProcedure(PROCEDURE_REGISTRY.get(["cb16", "persisted"])!, {}))).toBe("loaded z");
    } finally {
      await store.close();
    }
    expect(getProcedureStore(PROCEDURE_REGISTRY)).toBeUndefined();
  });
});
