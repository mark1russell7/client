import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Client } from "./client.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema, zodAdapter } from "../procedures/core/schemas.js";
import { ProcedureRegistry } from "../procedures/registry.js";

// route() runs registry handlers directly, so a stub transport suffices.
const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

const GreetInput = z.object({
  name: z.string(),
  greeting: z.string().default("hello"),
});

function makeClient(received: unknown[]): Client {
  const reg = new ProcedureRegistry();
  reg.register(
    defineProcedure({
      path: ["test", "greet"],
      input: zodAdapter(GreetInput),
      output: outputSchema<{ text: string }>(),
      handler: (input: z.infer<typeof GreetInput>) => {
        received.push(input);
        return { text: `${input.greeting} ${input.name}` };
      },
    })
  );
  return new Client(stubTransport).useRegistry(reg);
}

describe("route() passes the validated input to the handler (regression: BUGS-2026-07 H31)", () => {
  it("applies schema defaults, as exec() does", async () => {
    const received: unknown[] = [];
    const client = makeClient(received);

    await client.route({ route: { test: { greet: { name: "Ada" } } } });

    expect(received).toEqual([{ name: "Ada", greeting: "hello" }]);
  });

  it("gives the handler the input of an { in, out } leaf, not the wrapper", async () => {
    const received: unknown[] = [];
    const client = makeClient(received);

    await client.route({ route: { test: { greet: { in: { name: "Bo", greeting: "hi" } } } } });

    expect(received).toEqual([{ name: "Bo", greeting: "hi" }]);
  });
});
