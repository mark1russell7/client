// A procedure package of the old kind: importing it registers `fixture.publish` in the global
// registry. The procedure publishes an event on `ctx.bus`, the bus of the remote events of the
// host. The server test loads it with `--procedures`, in one test only.
import { PROCEDURE_REGISTRY, createProcedure, outputSchema } from "@procedures/client";

const publish = createProcedure()
  .path(["fixture", "publish"])
  .input(outputSchema())
  .output(outputSchema())
  .handler((input, ctx) => {
    ctx.bus.emit(input.topic, input.data);
    return { published: input.topic };
  })
  .build();

if (!PROCEDURE_REGISTRY.has(publish.path)) PROCEDURE_REGISTRY.register(publish);
