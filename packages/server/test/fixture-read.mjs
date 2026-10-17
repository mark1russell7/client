// A procedure package of the old kind: importing it registers `fixture.readFile` and
// `fixture.readFileUndeclared` in the global registry. Each procedure reads a file with a nested
// call of `fs.read`. The server test loads them with `--procedures`, in one test only.
// - `fixture.readFile` declares its effects and empty root rules: it reaches files only through
//   `fs.read`, so the root of `--fs-root` confines its nested call.
// - `fixture.readFileUndeclared` declares nothing, so the root refuses it (roadmap R33).
import { PROCEDURE_REGISTRY, createProcedure, outputSchema } from "@procedures/client";

const readFile = createProcedure()
  .path(["fixture", "readFile"])
  .input(outputSchema())
  .output(outputSchema())
  .meta({ calls: ["fs.read"], effects: { reads: ["fs"], writes: [] }, fsRoot: {} })
  .handler((input, ctx) => ctx.client.call(["fs", "read"], { path: input.path }))
  .build();

const readFileUndeclared = createProcedure()
  .path(["fixture", "readFileUndeclared"])
  .input(outputSchema())
  .output(outputSchema())
  .meta({ calls: ["fs.read"] })
  .handler((input, ctx) => ctx.client.call(["fs", "read"], { path: input.path }))
  .build();

for (const procedure of [readFile, readFileUndeclared]) {
  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);
}
