/**
 * Procedure: mongo.collections.drop
 * Drop (delete) a collection
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionName, databaseFor, type ScopeInput } from "../scope.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";

// Input/Output types
interface DropInput extends ScopeInput {
  /** Confirmation required to prevent accidental drops */
  confirm: boolean;
}

interface DropOutput {
  acknowledged: boolean;
  dropped: boolean;
}

// Schemas
const dropInputSchema = zodAdapter<DropInput>(
  z.object({
    ...scopeFields(),
    confirm: z.boolean().describe("Set to true to drop the collection and all of its documents"),
  })
);
const dropOutputSchema = zodAdapter<DropOutput>(
  z.looseObject({
    acknowledged: z.boolean().describe("True when the server confirmed the write"),
    dropped: z.boolean().describe("False when the collection did not exist"),
  })
);

export const dropProcedure: Procedure<
  DropInput,
  DropOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "collections", "drop"])
  .input(dropInputSchema)
  .output(dropOutputSchema)
  .meta({ description: "Drop (delete) a collection" })
  .handler(async (input: DropInput, ctx: ProcedureContext) => {
    const name = collectionName(input, ctx);

    if (!input.confirm) {
      throw new Error("confirm must be true to drop a collection");
    }

    const db = await databaseFor(input, ctx);
    const dropped = await db.dropCollection(name);

    return {
      acknowledged: true,
      dropped,
    };
  })
  .build();

export type { DropInput, DropOutput };
