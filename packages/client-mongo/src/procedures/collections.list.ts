/**
 * Procedure: mongo.collections.list
 * List all collections in the database
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@procedures/client";
import { databaseFor, type ScopeInput } from "../scope.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";

// Input/Output types
/** The input: only the scope fields. */
type ListInput = ScopeInput;

interface ListOutput {
  collections: string[];
}

// Schemas
const listInputSchema = zodAdapter<ListInput>(
  z.object({ ...scopeFields() })
);
const listOutputSchema = zodAdapter<ListOutput>(
  z.looseObject({
    collections: z.array(z.string()).describe("The collection names of the database"),
  })
);

export const listProcedure: Procedure<
  ListInput,
  ListOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "collections", "list"])
  .input(listInputSchema)
  .output(listOutputSchema)
  .meta({ description: "List all collections in the database" })
  .handler(async (input: ListInput, ctx: ProcedureContext) => {
    const db = await databaseFor(input, ctx);

    const collections = await db.listCollections().toArray();
    const collectionNames = collections
      .filter((c) => c.type === "collection")
      .map((c) => c.name)
      .sort();

    return {
      collections: collectionNames,
    };
  })
  .build();

export type { ListInput, ListOutput };
