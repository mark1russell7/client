/**
 * Procedure: mongo.documents.aggregate
 * Run an aggregation pipeline
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import {
  type AggregationStage,
  type AggregationOptions,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface AggregateInput extends ScopeInput {
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
    const { collection } = await collectionFor(input, ctx);

    const results = await collection
      .aggregate(input.pipeline, input.options)
      .toArray();

    return { results };
  })
  .build();

export type { AggregateInput, AggregateOutput };
