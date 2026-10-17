// A procedure package of the old kind for `mark serve --procedures`: importing it registers
// `e2e.publish`. The procedure publishes an event on `ctx.bus`, the bus of the remote events.
import { PROCEDURE_REGISTRY, createProcedure, outputSchema } from "@procedures/client";

const publish = createProcedure()
  .path(["e2e", "publish"])
  .input(outputSchema())
  .output(outputSchema())
  .handler((input, ctx) => {
    ctx.bus.emit(input.topic, input.data);
    return { published: input.topic };
  })
  .build();

if (!PROCEDURE_REGISTRY.has(publish.path)) PROCEDURE_REGISTRY.register(publish);
