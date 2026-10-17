// A procedure package of the old kind: importing it registers `fixture.readFile` in the global
// registry. The procedure reads a file with a nested call of `fs.read`, so the root of
// `--fs-root` confines it. The server test loads it with `--procedures`, in one test only.
import { PROCEDURE_REGISTRY, createProcedure, outputSchema } from "@procedures/client";

const readFile = createProcedure()
  .path(["fixture", "readFile"])
  .input(outputSchema())
  .output(outputSchema())
  .meta({ calls: ["fs.read"] })
  .handler((input, ctx) => ctx.client.call(["fs", "read"], { path: input.path }))
  .build();

if (!PROCEDURE_REGISTRY.has(readFile.path)) PROCEDURE_REGISTRY.register(readFile);
