/**
 * Procedure: mongo.database.info
 * Get database information and statistics
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { databaseFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import { type DatabaseInfo } from "../types.js";

// Input/Output types
/** The input: only the scope fields. */
type InfoInput = ScopeInput;

// Schemas
const infoInputSchema = schema<InfoInput>();
const infoOutputSchema = schema<DatabaseInfo>();

export const infoProcedure: Procedure<
  InfoInput,
  DatabaseInfo,
  { description: string }
> = createProcedure()
  .path(["mongo", "database", "info"])
  .input(infoInputSchema)
  .output(infoOutputSchema)
  .meta({ description: "Get database information and statistics" })
  .handler(async (input: InfoInput, ctx: ProcedureContext) => {
    const db = await databaseFor(input, ctx);

    const stats = await db.stats();
    const collections = await db.listCollections().toArray();

    const views = collections.filter((c) => c.type === "view").length;

    return {
      name: db.databaseName,
      collections: collections.length - views,
      views,
      sizeOnDisk: stats["dataSize"] ?? 0,
      empty: collections.length === 0,
    };
  })
  .build();

export type { InfoInput };
export type InfoOutput = DatabaseInfo;
