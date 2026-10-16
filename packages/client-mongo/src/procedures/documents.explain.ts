/**
 * Procedure: mongo.documents.explain (roadmap R44)
 * The plan of a find or of an aggregation pipeline
 *
 * With `pipeline`, the procedure explains an aggregation. Else it explains a find with `query`
 * (default: all documents). It refuses `$out` and `$merge`, as `documents.aggregate` does (R7):
 * the verbosity `executionStats` runs the plan.
 */

import { createProcedure, zodAdapter, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import type { Document, ExplainVerbosityLike, FindOptions } from "mongodb";
import { z } from "zod";
import { collectionFor, copyScope, SCOPE_FIELDS, type ScopeInput } from "../scope.js";
import { described, documentObject, scopeFields } from "./input-schemas.js";
import { writingStage } from "./documents.aggregate.js";
import type { AggregationStage, DocumentQuery, SortSpec } from "../types.js";

/** How much the server tells: the plan only, or also the statistics of a run. */
type Verbosity = "queryPlanner" | "executionStats" | "allPlansExecution";
const VERBOSITIES: readonly Verbosity[] = ["queryPlanner", "executionStats", "allPlansExecution"];

// Input/Output types
interface ExplainInput extends ScopeInput {
  /** The filter of a find (default: all documents). Not with `pipeline`. */
  query?: DocumentQuery;
  /** The fields of a find to give (1) or to leave out (0) */
  projection?: Record<string, 0 | 1>;
  /** The sort order of a find */
  sort?: SortSpec;
  /** The most documents of a find */
  limit?: number;
  /** An aggregation pipeline (not with `query`) */
  pipeline?: AggregationStage[];
  /** The verbosity (default: queryPlanner) */
  verbosity?: Verbosity;
}

interface ExplainOutput {
  /** "find" or "aggregate" */
  operation: "find" | "aggregate";
  /** The explain document of the server */
  plan: Record<string, unknown>;
}

const PROCEDURE = "mongo.documents.explain";
const INPUT_FIELDS = new Set<string>(["query", "projection", "sort", "limit", "pipeline", "verbosity", ...SCOPE_FIELDS]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function checks the input of an explain. */
export function parseExplainInput(data: unknown): ExplainInput {
  if (!isPlainObject(data)) throw new Error(`${PROCEDURE}: input must be an object`);
  for (const key of Object.keys(data)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`${PROCEDURE}: unknown field "${key}". The fields are: ${[...INPUT_FIELDS].join(", ")}`);
  }
  const result: ExplainInput = {};
  copyScope(data, result);
  const pipeline = data["pipeline"];
  if (pipeline !== undefined) {
    for (const field of ["query", "projection", "sort", "limit"]) {
      if (data[field] !== undefined) throw new Error(`${PROCEDURE}: give a pipeline or the fields of a find (${field}), not both`);
    }
    if (!Array.isArray(pipeline) || !pipeline.every(isPlainObject)) throw new Error(`${PROCEDURE}: pipeline must be a list of stages`);
    const stage = writingStage(pipeline);
    if (stage) throw new Error(`${PROCEDURE} is read only: the stage ${stage} writes to a collection`);
    result.pipeline = pipeline as AggregationStage[];
  }
  for (const field of ["query", "projection", "sort"] as const) {
    const value = data[field];
    if (value === undefined) continue;
    if (!isPlainObject(value)) throw new Error(`${PROCEDURE}: ${field} must be an object`);
    (result as Record<string, unknown>)[field] = value;
  }
  const limit = data["limit"];
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) throw new Error(`${PROCEDURE}: limit must be an integer >= 1`);
    result.limit = limit;
  }
  const verbosity = data["verbosity"];
  if (verbosity !== undefined) {
    if (!VERBOSITIES.includes(verbosity as Verbosity)) throw new Error(`${PROCEDURE}: verbosity must be ${VERBOSITIES.join(", ")}`);
    result.verbosity = verbosity as Verbosity;
  }
  return result;
}

/** The explain document without the fields of the cluster time: they hold signatures, not the plan. */
function planOf(explained: Document): Record<string, unknown> {
  const { $clusterTime: _clusterTime, operationTime: _operationTime, ...plan } = explained;
  return plan;
}

// Schemas
const explainInputSchema = described<ExplainInput>(
  parseExplainInput,
  z.object({
    ...scopeFields(),
    query: documentObject().optional().describe("The filter of a find (default: all documents). Not with pipeline."),
    projection: z.record(z.string(), z.union([z.literal(0), z.literal(1)])).optional().describe("The fields of a find to give (1) or to leave out (0)"),
    sort: z.record(z.string(), z.unknown()).optional().describe("The sort order of a find: { field: 1 } ascending, { field: -1 } descending"),
    limit: z.number().int().min(1).optional().describe("The most documents of a find"),
    pipeline: z.array(documentObject()).optional().describe("An aggregation pipeline to explain, in place of a find. $out and $merge are refused."),
    verbosity: z
      .enum(["queryPlanner", "executionStats", "allPlansExecution"])
      .optional()
      .describe("queryPlanner (the default): the plan only. executionStats and allPlansExecution also run the plan."),
  })
);
const explainOutputSchema = zodAdapter<ExplainOutput>(
  z.looseObject({
    operation: z.enum(["find", "aggregate"]).describe("The operation that the server explained"),
    plan: z.record(z.string(), z.unknown()).describe("The explain document of the server (queryPlanner, and executionStats with that verbosity)"),
  })
);

export const explainProcedure: Procedure<
  ExplainInput,
  ExplainOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "explain"])
  .input(explainInputSchema)
  .output(explainOutputSchema)
  .meta({
    description: "The plan of a find or an aggregation pipeline (read only: $out and $merge are refused)",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: ExplainInput, ctx: ProcedureContext): Promise<ExplainOutput> => {
    const { collection } = await collectionFor(input, ctx);
    const verbosity: ExplainVerbosityLike = input.verbosity ?? "queryPlanner";
    if (input.pipeline) {
      return { operation: "aggregate", plan: planOf(await collection.aggregate(input.pipeline).explain(verbosity)) };
    }
    const options: FindOptions = {};
    if (input.projection) options.projection = input.projection;
    if (input.sort) options.sort = input.sort;
    if (input.limit !== undefined) options.limit = input.limit;
    return { operation: "find", plan: planOf(await collection.find(input.query ?? {}, options).explain(verbosity)) };
  })
  .build();

export type { ExplainInput, ExplainOutput };
