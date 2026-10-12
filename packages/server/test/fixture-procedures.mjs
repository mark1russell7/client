// A procedure package of the old kind (no `module` entry): importing it registers a procedure in
// the global registry. The server test loads it with `--procedures`.
import { PROCEDURE_REGISTRY, createProcedure, outputSchema } from "@mark1russell7/client";

const hello = createProcedure()
  .path(["fixture", "hello"])
  .input(outputSchema())
  .output(outputSchema())
  .handler(() => "hello")
  .build();

if (!PROCEDURE_REGISTRY.has(hello.path)) PROCEDURE_REGISTRY.register(hello);
