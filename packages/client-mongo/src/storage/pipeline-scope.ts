/**
 * The guard of an aggregation pipeline over shared collections (Graph's split plan, part P3). A
 * pipeline of a caller reads only the documents of a filter (for example of one tenant or one
 * partition), on each collection that it reads, and a write stamps its fields.
 *
 * - The filter goes before the first stage, into a stage that must be first (`$geoNear`,
 *   `$search`, `$vectorSearch`), into a `$match` with `$text`, and into each sub-pipeline
 *   (`$lookup`, `$graphLookup`, `$unionWith`, `$facet`).
 * - `$out` replaces a whole collection, so it is refused. `$merge` is refused unless the scope
 *   permits writes: then it gets the stamp, and its match key includes the stamp fields.
 * - The stages of the server (for example `$currentOp`) and the JavaScript operators of the
 *   server (`$function`, `$accumulator`, `$where`) are refused at each depth.
 * - A stage has exactly one key, so a second key cannot hide a refused stage.
 * - The function changes no part of the pipeline of the caller.
 */

import type { Document } from "mongodb";

/** The stages that read the server, not the documents of a filter. */
export const BLOCKED_PIPELINE_STAGES: ReadonlySet<string> = new Set([
  "$currentOp",
  "$listSessions",
  "$listLocalSessions",
  "$listSampledQueries",
  "$collStats",
  "$indexStats",
  "$planCacheStats",
  "$shardedDataDistribution",
  "$queryStats",
  "$listSearchIndexes",
  "$changeStream",
  "$changeStreamSplitLargeEvent",
]);

/** The operators that start JavaScript on the server. */
export const BLOCKED_PIPELINE_OPERATORS: ReadonlySet<string> = new Set(["$function", "$accumulator", "$where"]);

/** The scope of a pipeline. */
export interface PipelineScope {
  /** The filter of the documents that the pipeline can read, on each collection that it reads. */
  readonly match: Document;
  /** The fields that each written document gets. With them, the pipeline can end in `$merge`. */
  readonly stamp?: Document | undefined;
}

/** This function throws when a value has a JavaScript operator of the server, at any depth. */
export function assertNoBlockedOperators(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    for (const element of value) assertNoBlockedOperators(element);
    return;
  }
  for (const [key, field] of Object.entries(value)) {
    if (BLOCKED_PIPELINE_OPERATORS.has(key)) throw new Error(`The operator ${key} is not allowed in a scoped pipeline`);
    assertNoBlockedOperators(field);
  }
}

/** The filter of a selector of a stage, and the filter of the scope. */
function scoped(selector: unknown, match: Document): Document {
  return typeof selector === "object" && selector !== null && !Array.isArray(selector) ? { ...(selector as Document), ...match } : { ...match };
}

/** The `equals` clauses of `$search` for the filter: each field must be a string, a number or a boolean. */
function searchFilter(match: Document): Document[] {
  return Object.entries(match).map(([path, value]) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`$search can filter the scope only by equality: the field ${path} has a condition`);
    }
    return { equals: { path, value } };
  });
}

/** The fields that a pipeline cannot remove: the fields of the filter and of the stamp. */
function guardedFields(scope: PipelineScope): Set<string> {
  return new Set([...Object.keys(scope.match), ...Object.keys(scope.stamp ?? {})].filter((key) => !key.startsWith("$")));
}

/** This function gives the pipeline with the filter of the scope on each read, and the stamp on each write. */
export function scopePipeline(pipeline: readonly Document[], scope: PipelineScope): Document[] {
  if (!Array.isArray(pipeline)) throw new Error("A pipeline must be an array");
  assertNoBlockedOperators(pipeline);
  const guarded = guardedFields(scope);
  const result: Document[] = [];
  let matched = false;

  for (const stage of pipeline) {
    if (typeof stage !== "object" || stage === null || Array.isArray(stage) || Object.keys(stage).length !== 1) {
      throw new Error("A pipeline stage must be an object with exactly one operator");
    }
    const name = Object.keys(stage)[0]!;
    const body = stage[name] as unknown;
    if (BLOCKED_PIPELINE_STAGES.has(name)) throw new Error(`The stage ${name} is not allowed in a scoped pipeline`);
    if (name === "$out") throw new Error("$out is not allowed in a scoped pipeline: it replaces the whole collection");

    // The stages that must be first take the filter themselves
    if (name === "$geoNear") {
      result.push({ $geoNear: { ...(body as Document), query: scoped((body as Document)["query"], scope.match) } });
      matched = true;
      continue;
    }
    if (name === "$vectorSearch") {
      result.push({ $vectorSearch: { ...(body as Document), filter: scoped((body as Document)["filter"], scope.match) } });
      matched = true;
      continue;
    }
    if (name === "$search" || name === "$searchMeta") {
      const search = { ...(body as Document) };
      let compound: Document;
      if (search["compound"] === undefined) {
        const operator: Document = {};
        for (const [key, value] of Object.entries(search)) if (key !== "index") operator[key] = value;
        compound = { must: [operator], filter: [] };
        for (const key of Object.keys(search)) if (key !== "index") delete search[key];
      } else {
        const existing = search["compound"] as Document;
        compound = { ...existing, filter: Array.isArray(existing["filter"]) ? [...(existing["filter"] as Document[])] : [] };
      }
      (compound["filter"] as Document[]).push(...searchFilter(scope.match));
      search["compound"] = compound;
      result.push({ [name]: search });
      matched = true;
      continue;
    }

    if (!matched) {
      result.push({ $match: { ...scope.match } });
      matched = true;
    }

    if (name === "$lookup") {
      const lookup = { ...(body as Document) };
      if (lookup["pipeline"] === undefined) {
        // The form with localField and foreignField becomes the form with a pipeline and the filter
        const local = lookup["localField"];
        const foreign = lookup["foreignField"];
        if (typeof local !== "string" || typeof foreign !== "string") throw new Error("$lookup needs localField and foreignField, or a pipeline");
        delete lookup["localField"];
        delete lookup["foreignField"];
        lookup["let"] = { ...(lookup["let"] as Document | undefined), scopeLocalValue: `$${local}` };
        lookup["pipeline"] = [{ $match: { ...scope.match } }, { $match: { $expr: { $eq: [`$${foreign}`, "$$scopeLocalValue"] } } }];
      } else {
        lookup["pipeline"] = scopePipeline(lookup["pipeline"] as Document[], { match: scope.match });
      }
      result.push({ $lookup: lookup });
      continue;
    }
    if (name === "$graphLookup") {
      const graph = body as Document;
      result.push({ $graphLookup: { ...graph, restrictSearchWithMatch: scoped(graph["restrictSearchWithMatch"], scope.match) } });
      continue;
    }
    if (name === "$unionWith") {
      const union: Document = typeof body === "string" ? { coll: body, pipeline: [] } : { ...(body as Document) };
      union["pipeline"] = scopePipeline((union["pipeline"] as Document[] | undefined) ?? [], { match: scope.match });
      result.push({ $unionWith: union });
      continue;
    }
    if (name === "$facet") {
      const facet: Document = {};
      for (const [branch, branchPipeline] of Object.entries(body as Document)) {
        facet[branch] = scopePipeline(branchPipeline as Document[], { match: scope.match });
      }
      result.push({ $facet: facet });
      continue;
    }
    if (name === "$merge") {
      if (scope.stamp === undefined) throw new Error("$merge is not allowed in a read-only scoped pipeline");
      const merge: Document = typeof body === "string" ? { into: body } : { ...(body as Document) };
      const into = merge["into"];
      if (typeof into === "object" && into !== null && (into as Document)["db"] !== undefined) {
        throw new Error("A $merge into another database is not allowed in a scoped pipeline");
      }
      const on = merge["on"] ?? "_id";
      const keys = typeof on === "string" ? [on] : [...(on as string[])];
      for (const field of Object.keys(scope.stamp)) if (!keys.includes(field)) keys.push(field);
      merge["on"] = keys;
      // The stamp comes last, so an update of the pipeline cannot write another value
      if (Array.isArray(merge["whenMatched"])) merge["whenMatched"] = [...(merge["whenMatched"] as Document[]), { $addFields: { ...scope.stamp } }];
      result.push({ $addFields: { ...scope.stamp } }, { $merge: merge });
      continue;
    }
    if (name === "$unset") {
      const fields = Array.isArray(body) ? body : [body];
      for (const field of fields) if (typeof field === "string" && guarded.has(field)) throw new Error(`A scoped pipeline cannot $unset ${field}`);
      result.push(stage);
      continue;
    }
    if (name === "$match" && typeof body === "object" && body !== null && (body as Document)["$text"] !== undefined) {
      result.push({ $match: { ...(body as Document), ...scope.match } });
      continue;
    }
    result.push(stage);
  }

  if (!matched) result.unshift({ $match: { ...scope.match } });
  return result;
}

/** The limits of an aggregation of a caller. */
export interface PipelineLimits {
  /** The longest time of the aggregation in milliseconds (default 10000). */
  readonly maxTimeMS?: number | undefined;
  /** The most documents of the result (default 5000). */
  readonly maxResults?: number | undefined;
}

/** The default limits of an aggregation. */
export const DEFAULT_PIPELINE_LIMITS: Readonly<{ maxTimeMS: number; maxResults: number }> = Object.freeze({ maxTimeMS: 10_000, maxResults: 5_000 });

/**
 * This function adds a `$limit` of one more than the result limit, so a cut result is known. A
 * pipeline that ends in `$merge` writes and gives no documents, so it gets no `$limit`.
 */
export function boundPipeline(pipeline: readonly Document[], maxResults: number): { pipeline: Document[]; limited: boolean } {
  const last = pipeline[pipeline.length - 1];
  const lastStage = last && typeof last === "object" ? Object.keys(last)[0] : undefined;
  if (lastStage === "$merge") return { pipeline: [...pipeline], limited: false };
  return { pipeline: [...pipeline, { $limit: maxResults + 1 }], limited: true };
}

/** This function gives at most `maxResults` documents, and tells if it cut the result. */
export function cutResults<T>(results: T[], maxResults: number, limited: boolean): { docs: T[]; truncated: boolean } {
  if (!limited || results.length <= maxResults) return { docs: results, truncated: false };
  return { docs: results.slice(0, maxResults), truncated: true };
}

/** True for the error of an operation that passed its `maxTimeMS` (code 50, MaxTimeMSExpired). */
export function isTimeLimitError(error: unknown): boolean {
  const value = error as { code?: unknown; codeName?: unknown } | null;
  return value?.code === 50 || value?.codeName === "MaxTimeMSExpired";
}
