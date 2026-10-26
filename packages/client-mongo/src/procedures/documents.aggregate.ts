/**
 * Procedure: mongo.documents.aggregate
 * Run an aggregation pipeline
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor, type ScopeInput } from "../scope.js";
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
const aggregateInputSchema: z.ZodType<AggregateInput> = z.object({
    ...scopeFields(),
    pipeline: z.array(documentObject()).describe("The aggregation stages, in order (for example [{ $match: {...} }, { $group: {...} }])"),
    options: z
      .looseObject({
        allowDiskUse: z.boolean().optional().describe("Allow the use of disk for large stages"),
        maxTimeMS: z.number().optional().describe("The longest run time in milliseconds"),
      })
      .optional()
      .describe("The options of the aggregation"),
  });
const aggregateOutputSchema: z.ZodType<AggregateOutput> = z.looseObject({
    results: z.array(z.record(z.string(), z.unknown())).describe("The documents that the pipeline gave"),
  });

/** The stages that write to a collection. A read-only procedure refuses them (CAP-2). */
const WRITING_STAGES = ["$out", "$merge"];

/**
 * The first stage that writes, or undefined. The search also goes into the pipelines of
 * `$facet`, `$lookup` and `$unionWith`.
 */
export function writingStage(pipeline: unknown): string | undefined {
  if (Array.isArray(pipeline)) {
    for (const stage of pipeline) {
      const found = writingStage(stage);
      if (found) return found;
    }
    return undefined;
  }
  if (pipeline === null || typeof pipeline !== "object") return undefined;
  for (const [key, value] of Object.entries(pipeline)) {
    if (WRITING_STAGES.includes(key)) return key;
    if (value !== null && typeof value === "object") {
      const found = writingStage(value);
      if (found) return found;
    }
  }
  return undefined;
}

export const aggregateProcedure: Procedure<
  AggregateInput,
  AggregateOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "aggregate"])
  .input(aggregateInputSchema)
  .output(aggregateOutputSchema)
  .meta({
    description: "Run an aggregation pipeline (read only: $out and $merge are refused)",
    // The procedure refuses $out and $merge, so it only reads (CAP-2). Before, it declared that
    // it writes, and a read-only session refused every aggregation.
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: AggregateInput, ctx: ProcedureContext) => {
    const stage = writingStage(input.pipeline);
    if (stage) {
      throw new Error(`mongo.documents.aggregate is read only: the stage ${stage} writes to a collection`);
    }
    const { collection } = await collectionFor(input, ctx);

    const results = await collection
      // The schema leaves out an option that the input does not give
      .aggregate(input.pipeline, input.options as AggregateOptions | undefined)
      .toArray();

    return { results };
  })
  .build();

export type { AggregateInput, AggregateOutput };
