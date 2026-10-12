/**
 * Procedure: mongo.documents.aggregate
 * Run an aggregation pipeline
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import { scopeFields, documentObject } from "./input-schemas.js";
import { z } from "zod";
import type { AggregateOptions } from "mongodb";
import {
  type AggregationStage,
  type AggregationOptions,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface AggregateInput extends ScopeInput {
  pipeline: AggregationStage[];
  options?: AggregationOptions | undefined;
}

interface AggregateOutput {
  results: MongoDocument[];
}

// Schemas
const aggregateInputSchema = zodAdapter<AggregateInput>(
  z.object({
    ...scopeFields(),
    pipeline: z.array(documentObject()).describe("The aggregation stages, in order (for example [{ $match: {...} }, { $group: {...} }])"),
    options: z
      .looseObject({
        allowDiskUse: z.boolean().optional().describe("Allow the use of disk for large stages"),
        maxTimeMS: z.number().optional().describe("The longest run time in milliseconds"),
      })
      .optional()
      .describe("The options of the aggregation"),
  })
);
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
      // The schema leaves out an option that the input does not give
      .aggregate(input.pipeline, input.options as AggregateOptions | undefined)
      .toArray();

    return { results };
  })
  .build();

export type { AggregateInput, AggregateOutput };
