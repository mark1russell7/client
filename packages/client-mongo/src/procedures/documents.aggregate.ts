/**
 * Procedure: mongo.documents.aggregate
 * Run an aggregation pipeline
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import {
  requireCollection,
  type AggregationStage,
  type AggregationOptions,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface AggregateInput {
  pipeline: AggregationStage[];
  options?: AggregationOptions;
}

interface AggregateOutput {
  results: MongoDocument[];
}

// Schemas
const aggregateInputSchema = schema<AggregateInput>();
const aggregateOutputSchema = schema<AggregateOutput>();

export const aggregateProcedure: Procedure<
  AggregateInput,
  AggregateOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "aggregate"])
  .input(aggregateInputSchema)
  .output(aggregateOutputSchema)
  .meta({ description: "Run an aggregation pipeline" })
  .handler(async (input: AggregateInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    const results = await collection
      .aggregate(input.pipeline, input.options)
      .toArray();

    return { results };
  })
  .build();

export type { AggregateInput, AggregateOutput };
