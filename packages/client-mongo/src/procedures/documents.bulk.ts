/**
 * Procedure: mongo.documents.bulk (roadmap R44)
 * Several writes in one request: insertOne, updateOne, updateMany, deleteOne and deleteMany
 *
 * The operations have the form of the `bulkWrite` of the driver, and run in order by default.
 * In order, the first failure stops the rest. With `ordered: false`, the server runs each
 * operation, and the error tells which ones failed.
 *
 * The rules of `update` and `delete` (deep dive DATA-4) apply to each operation: an empty filter
 * of an update or a delete needs `confirm: true`, and an unknown field is an error.
 */

import { createProcedure, zodAdapter, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { z } from "zod";
import { collectionFor, copyScope, SCOPE_FIELDS, type ScopeInput } from "../scope.js";
import { described, documentObject, scopeFields } from "./input-schemas.js";
import type { BulkOperation, DocumentQuery, DocumentUpdate } from "../types.js";

// Input/Output types
interface BulkInput extends ScopeInput {
  /** The writes, in order */
  operations: BulkOperation[];
  /** True (the default): the first failure stops the rest */
  ordered?: boolean;
  /** Set to true to use an empty filter in an update or a delete */
  confirm?: boolean;
}

interface BulkOutput {
  ok: boolean;
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
  /** The ids of the inserted documents, as text, by the index of their operation */
  insertedIds: Record<string, string>;
  /** The ids of the documents that an upsert made, as text, by the index of their operation */
  upsertedIds: Record<string, string>;
}

const PROCEDURE = "mongo.documents.bulk";
const INPUT_FIELDS = new Set<string>(["operations", "ordered", "confirm", ...SCOPE_FIELDS]);

/** The fields of the body of each kind of operation, and the fields that it needs. */
const KINDS: Record<string, { fields: readonly string[]; required: readonly string[] }> = {
  insertOne: { fields: ["document"], required: ["document"] },
  updateOne: { fields: ["filter", "update", "upsert"], required: ["filter", "update"] },
  updateMany: { fields: ["filter", "update", "upsert"], required: ["filter", "update"] },
  deleteOne: { fields: ["filter"], required: ["filter"] },
  deleteMany: { fields: ["filter"], required: ["filter"] },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function checks one operation, and gives it in the form of the driver. */
function parseOperation(raw: unknown, index: number, confirm: boolean): BulkOperation {
  const at = `${PROCEDURE}: operations[${index}]`;
  if (!isPlainObject(raw) || Object.keys(raw).length !== 1) {
    throw new Error(`${at} must be an object with one of the keys ${Object.keys(KINDS).join(", ")}`);
  }
  const kind = Object.keys(raw)[0]!;
  const spec = KINDS[kind];
  if (!spec) throw new Error(`${at}: unknown operation "${kind}". The operations are: ${Object.keys(KINDS).join(", ")}`);
  const body = raw[kind];
  if (!isPlainObject(body)) throw new Error(`${at}.${kind} must be an object`);
  for (const key of Object.keys(body)) {
    if (!spec.fields.includes(key)) throw new Error(`${at}.${kind}: unknown field "${key}". The fields are: ${spec.fields.join(", ")}`);
  }
  for (const key of spec.required) {
    if (body[key] === undefined) throw new Error(`${at}.${kind}: ${key} is required`);
  }
  if (kind === "insertOne") {
    if (!isPlainObject(body["document"])) throw new Error(`${at}.insertOne: document must be an object`);
    return { insertOne: { document: body["document"] } };
  }
  const filter = body["filter"];
  if (!isPlainObject(filter)) throw new Error(`${at}.${kind}: filter must be an object`);
  if (Object.keys(filter).length === 0 && !confirm) {
    throw new Error(`${at}.${kind}: an empty filter matches every document. Set confirm: true to use it.`);
  }
  if (kind === "deleteOne") return { deleteOne: { filter: filter as DocumentQuery } };
  if (kind === "deleteMany") return { deleteMany: { filter: filter as DocumentQuery } };
  const update = body["update"];
  if (typeof update !== "object" || update === null) {
    throw new Error(`${at}.${kind}: update must be an object (or a pipeline array)`);
  }
  const upsert = body["upsert"];
  if (upsert !== undefined && typeof upsert !== "boolean") throw new Error(`${at}.${kind}: upsert must be a boolean`);
  const operation = { filter: filter as DocumentQuery, update: update as DocumentUpdate, ...(upsert !== undefined ? { upsert } : {}) };
  return kind === "updateOne" ? { updateOne: operation } : { updateMany: operation };
}

/** This function checks the input of a bulk write. */
export function parseBulkInput(data: unknown): BulkInput {
  if (!isPlainObject(data)) throw new Error(`${PROCEDURE}: input must be an object`);
  for (const key of Object.keys(data)) {
    if (!INPUT_FIELDS.has(key)) throw new Error(`${PROCEDURE}: unknown field "${key}". The fields are: ${[...INPUT_FIELDS].join(", ")}`);
  }
  for (const field of ["ordered", "confirm"]) {
    if (data[field] !== undefined && typeof data[field] !== "boolean") throw new Error(`${PROCEDURE}: ${field} must be a boolean`);
  }
  const confirm = data["confirm"] === true;
  const operations = data["operations"];
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error(`${PROCEDURE}: operations must be a list with at least one operation`);
  }
  const result: BulkInput = { operations: operations.map((operation, index) => parseOperation(operation, index, confirm)) };
  copyScope(data, result);
  if (data["ordered"] !== undefined) result.ordered = data["ordered"] as boolean;
  if (confirm) result.confirm = true;
  return result;
}

/** The ids of a result, as text, by the index of their operation. */
function idsAsText(ids: Record<number, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(ids ?? {}).map(([index, id]) => [index, String(id)]));
}

// Schemas
const operationBody = (fields: Record<string, z.ZodType>) => z.object(fields);
const filterField = documentObject().describe("The filter of the documents. An empty filter needs confirm: true.");
const updateField = z
  .union([documentObject(), z.array(documentObject())])
  .describe('The update operations, for example { $set: { status: "done" } }, or a pipeline');
const upsertField = z.boolean().optional().describe("Insert a document when none matches");

const bulkInputSchema = described<BulkInput>(
  parseBulkInput,
  z.object({
    ...scopeFields(),
    operations: z
      .array(
        z.union([
          z.object({ insertOne: operationBody({ document: documentObject().describe("The new document") }) }),
          z.object({ updateOne: operationBody({ filter: filterField, update: updateField, upsert: upsertField }) }),
          z.object({ updateMany: operationBody({ filter: filterField, update: updateField, upsert: upsertField }) }),
          z.object({ deleteOne: operationBody({ filter: filterField }) }),
          z.object({ deleteMany: operationBody({ filter: filterField }) }),
        ])
      )
      .min(1)
      .describe("The writes, in order: each one is { insertOne }, { updateOne }, { updateMany }, { deleteOne } or { deleteMany }"),
    ordered: z.boolean().optional().describe("True (the default): the first failure stops the rest. False: the server tries each write."),
    confirm: z.boolean().optional().describe("Set to true to use an empty filter, which matches every document, in an update or a delete"),
  })
);
const bulkOutputSchema = zodAdapter<BulkOutput>(
  z.looseObject({
    ok: z.boolean().describe("True when the server confirmed the writes"),
    insertedCount: z.number().describe("The number of inserted documents"),
    matchedCount: z.number().describe("The number of documents that the updates matched"),
    modifiedCount: z.number().describe("The number of documents that the updates changed"),
    deletedCount: z.number().describe("The number of deleted documents"),
    upsertedCount: z.number().describe("The number of documents that an upsert made"),
    insertedIds: z.record(z.string(), z.string()).describe("The ids of the inserted documents, as text, by the index of their operation"),
    upsertedIds: z.record(z.string(), z.string()).describe("The ids of the upserted documents, as text, by the index of their operation"),
  })
);

export const bulkProcedure: Procedure<
  BulkInput,
  BulkOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "bulk"])
  .input(bulkInputSchema)
  .output(bulkOutputSchema)
  .meta({
    description: "Several writes in one request: insertOne, updateOne, updateMany, deleteOne and deleteMany, in order by default",
    effects: { reads: ["mongo", "network"], writes: ["mongo", "network"] },
  })
  .handler(async (input: BulkInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);
    const result = await collection.bulkWrite(input.operations as AnyBulkWriteOperation<Document>[], { ordered: input.ordered ?? true });
    return {
      ok: result.ok === 1,
      insertedCount: result.insertedCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
      insertedIds: idsAsText(result.insertedIds),
      upsertedIds: idsAsText(result.upsertedIds),
    };
  })
  .build();

export type { BulkInput, BulkOutput };
