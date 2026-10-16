/**
 * Procedure: mongo.watch (roadmap R44)
 * The changes of a collection or of a database, as a stream (a change stream)
 *
 * The stream has no end (`metadata.stream: { unbounded: true }`). It stops when the reader stops
 * or the signal of the call aborts: the procedure then closes the change stream. A change stream
 * needs a replica set or a sharded cluster: a server without one refuses it.
 */

import { createProcedure, zodAdapter, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import type { ChangeStream, ChangeStreamOptions, Document } from "mongodb";
import { z } from "zod";
import { collectionFor, databaseFor, copyScope, SCOPE_FIELDS, type ScopeInput } from "../scope.js";
import { described, documentObject } from "./input-schemas.js";

/** The stages that a change stream accepts after its own stage. */
const CHANGE_STREAM_STAGES = ["$match", "$project", "$addFields", "$set", "$unset", "$replaceRoot", "$replaceWith", "$redact"];

type FullDocument = "default" | "updateLookup" | "whenAvailable" | "required";
const FULL_DOCUMENT: readonly FullDocument[] = ["default", "updateLookup", "whenAvailable", "required"];

// Input/Output types
interface WatchInput extends ScopeInput {
  /** The stages after the change stream stage: $match, $project and the other stages it accepts */
  pipeline?: Document[];
  /** The full document of an update: "default" (none), "updateLookup", "whenAvailable" or "required" */
  fullDocument?: FullDocument;
  /** The resume token of an earlier change: the stream starts after it */
  resumeAfter?: string;
}

/** One change: an item of the stream. */
interface WatchChange {
  /** insert, update, replace, delete, drop, rename, dropDatabase or invalidate */
  operationType: string;
  /** The database and the collection of the change */
  ns?: { db: string; coll?: string | undefined } | undefined;
  /** The _id of the changed document */
  documentKey?: Record<string, unknown> | undefined;
  /** The document of an insert or a replace (and of an update with fullDocument) */
  fullDocument?: Record<string, unknown> | null | undefined;
  /** The changed and removed fields of an update */
  updateDescription?: Record<string, unknown> | undefined;
  /** The time of the change on the server (ISO 8601), from MongoDB 6.0 */
  wallTime?: string | undefined;
  /** The resume token of the change: resumeAfter takes it */
  resumeToken: string;
}

const PROCEDURE = "mongo.watch";
const INPUT_FIELDS = new Set<string>(["pipeline", "fullDocument", "resumeAfter", ...SCOPE_FIELDS]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function checks the input of a watch. */
export function parseWatchInput(data: unknown): WatchInput {
  if (!isPlainObject(data)) throw new Error(`${PROCEDURE}: input must be an object`);
  for (const key of Object.keys(data)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`${PROCEDURE}: unknown field "${key}". The fields are: ${[...INPUT_FIELDS].join(", ")}`);
  }
  const result: WatchInput = {};
  copyScope(data, result);
  const pipeline = data["pipeline"];
  if (pipeline !== undefined) {
    if (!Array.isArray(pipeline)) throw new Error(`${PROCEDURE}: pipeline must be a list of stages`);
    for (const [index, stage] of pipeline.entries()) {
      const names = isPlainObject(stage) ? Object.keys(stage) : [];
      if (names.length !== 1 || !CHANGE_STREAM_STAGES.includes(names[0]!)) {
        throw new Error(`${PROCEDURE}: pipeline[${index}] must be one stage of ${CHANGE_STREAM_STAGES.join(", ")}`);
      }
    }
    result.pipeline = pipeline as Document[];
  }
  const fullDocument = data["fullDocument"];
  if (fullDocument !== undefined) {
    if (!FULL_DOCUMENT.includes(fullDocument as FullDocument)) throw new Error(`${PROCEDURE}: fullDocument must be ${FULL_DOCUMENT.join(", ")}`);
    result.fullDocument = fullDocument as FullDocument;
  }
  const resumeAfter = data["resumeAfter"];
  if (resumeAfter !== undefined) {
    if (typeof resumeAfter !== "string" || resumeAfter.length === 0) throw new Error(`${PROCEDURE}: resumeAfter must be a resume token (text)`);
    result.resumeAfter = resumeAfter;
  }
  return result;
}

/** The item of one change event of the driver. */
export function toWatchChange(event: Document): WatchChange {
  const id = event["_id"] as { _data?: unknown } | undefined;
  const change: WatchChange = {
    operationType: String(event["operationType"]),
    resumeToken: typeof id?._data === "string" ? id._data : JSON.stringify(id ?? null),
  };
  if (isPlainObject(event["ns"])) change.ns = event["ns"] as { db: string; coll?: string | undefined };
  if (isPlainObject(event["documentKey"])) change.documentKey = event["documentKey"];
  if (event["fullDocument"] !== undefined) change.fullDocument = event["fullDocument"] as Record<string, unknown> | null;
  if (isPlainObject(event["updateDescription"])) change.updateDescription = event["updateDescription"];
  if (event["wallTime"] instanceof Date) change.wallTime = event["wallTime"].toISOString();
  return change;
}

/**
 * The changes, as a stream. The change stream closes when the reader stops (the `finally` of the
 * generator) or when the signal aborts (the close ends the wait for the next change).
 */
export async function* watchChanges(input: WatchInput, ctx: ProcedureContext): AsyncGenerator<WatchChange, void, undefined> {
  const options: ChangeStreamOptions = {};
  if (input.fullDocument) options.fullDocument = input.fullDocument;
  if (input.resumeAfter) options.resumeAfter = { _data: input.resumeAfter };
  const pipeline = input.pipeline ?? [];
  const stream: ChangeStream =
    input.collection !== undefined || ctx.metadata["collection"] !== undefined
      ? (await collectionFor(input, ctx)).collection.watch(pipeline, options)
      : (await databaseFor(input, ctx)).watch(pipeline, options);
  const signal = ctx.signal;
  // True when the signal closed the change stream. The driver also closes it before it throws a
  // failure (a server without a replica set): that error goes to the reader.
  let stopped = false;
  const close = (): void => {
    stopped = true;
    stream.close().catch(() => undefined);
  };
  signal?.addEventListener("abort", close, { once: true });
  try {
    if (signal?.aborted) return;
    for await (const event of stream) {
      yield toWatchChange(event);
    }
  } catch (error) {
    // The abort of the call ends the stream without an error
    if (stopped) return;
    throw error;
  } finally {
    signal?.removeEventListener("abort", close);
    await stream.close().catch(() => undefined);
  }
}

// Schemas
const watchInputSchema = described<WatchInput>(
  parseWatchInput,
  z.object({
    collection: z.string().min(1).optional().describe("The collection to watch. Without it, the stream gives the changes of the database."),
    database: z.string().min(1).optional().describe("The database name (default: the database of the connection)"),
    pipeline: z.array(documentObject()).optional().describe("Stages after the change stream stage: $match, $project, $addFields, $set, $unset, $replaceRoot, $replaceWith, $redact"),
    fullDocument: z.enum(["default", "updateLookup", "whenAvailable", "required"]).optional().describe("The full document of an update: updateLookup reads it (default: none)"),
    resumeAfter: z.string().min(1).optional().describe("The resume token of an earlier change: the stream starts after it"),
  })
);
const watchOutputSchema = zodAdapter<WatchChange>(
  z.looseObject({
    operationType: z.string().describe("insert, update, replace, delete, drop, rename, dropDatabase or invalidate"),
    ns: z.looseObject({ db: z.string(), coll: z.string().optional() }).optional().describe("The database and the collection of the change"),
    documentKey: z.record(z.string(), z.unknown()).optional().describe("The _id of the changed document"),
    fullDocument: z.record(z.string(), z.unknown()).nullable().optional().describe("The document of an insert or a replace, and of an update with fullDocument"),
    updateDescription: z.record(z.string(), z.unknown()).optional().describe("The changed and removed fields of an update"),
    wallTime: z.string().optional().describe("The time of the change on the server (ISO 8601), from MongoDB 6.0"),
    resumeToken: z.string().describe("The resume token of the change: resumeAfter takes it"),
  })
);

export const watchProcedure: Procedure<
  WatchInput,
  WatchChange,
  { description: string; effects?: Effects; stream?: { unbounded?: boolean }; output?: string }
> = createProcedure()
  .path(["mongo", "watch"])
  .input(watchInputSchema)
  .output(watchOutputSchema)
  .meta({
    description: "The changes of a collection or a database, as a stream without an end (a change stream needs a replica set)",
    effects: { reads: ["mongo", "network"], writes: [] },
    // The stream has no end: it stops when the reader stops (roadmap R15)
    stream: { unbounded: true },
    output: "streaming",
  })
  // invokeProcedure reads a returned async iterable as a stream: the handler types of the core do
  // not describe that case
  .handler(((input: WatchInput, ctx: ProcedureContext) => watchChanges(input, ctx)) as never)
  .build();

export type { WatchInput, WatchChange };
