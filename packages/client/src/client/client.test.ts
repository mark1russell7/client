import { describe, it, expect } from "vitest";
import { Client } from "./client.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { ProcedureRegistry } from "../procedures/registry.js";

// exec() finds the procedure in the registry and never touches the transport, so a stub suffices.
const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function makeClient(): Client {
  const reg = new ProcedureRegistry();
  reg.register(
    defineProcedure({
      path: ["test", "echo"],
      input: outputSchema<{ msg: string }>(),
      output: outputSchema<{ echo: string }>(),
      handler: (input: { msg: string }) => ({ echo: input.msg }),
    })
  );
  return new Client(stubTransport).useRegistry(reg);
}

describe("withContext child clients (regression: BUGS-2026-07 H1)", () => {
  it("does not crash on exec() — child inherits the procedure registry", async () => {
    const client = makeClient();
    const child = client.withContext({});
    const result = await child.exec(["test", "echo"], { msg: "hi" });
    expect(result).toEqual({ echo: "hi" });
  });

  it("nested children (grandchild) also inherit the registry", async () => {
    const client = makeClient();
    const grandchild = client.withContext({}).withContext({});
    const result = await grandchild.exec(["test", "echo"], { msg: "deep" });
    expect(result).toEqual({ echo: "deep" });
  });
});
