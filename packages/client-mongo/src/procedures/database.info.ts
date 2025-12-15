/**
 * Procedure: mongo.database.info
 * Get database information and statistics
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta, type DatabaseInfo } from "../types.js";

// Input/Output types
interface InfoInput {
  [key: string]: never;
}

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
  .handler(async (_input: InfoInput, ctx: ProcedureContext) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();

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
