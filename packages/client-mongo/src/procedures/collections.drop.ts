/**
 * Procedure: mongo.collections.drop
 * Drop (delete) a collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionName, databaseFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";

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
const dropInputSchema = schema<DropInput>();
const dropOutputSchema = schema<DropOutput>();

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
