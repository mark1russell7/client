/**
 * The target of a write: one document by `id`, or the documents that match a `filter`.
 *
 * Before, a call without `id` and `filter` used the filter `{}`, and the field name of
 * `find`/`count` (`query`) was ignored: `delete { query, multi: true }` emptied the
 * collection (deep dive DATA-4). Now a write needs exactly one target, an unknown field is an
 * error, and an empty filter needs `confirm: true`.
 */

import { ObjectId, type Collection, type Document } from "mongodb";
import { buildIdFilter, type DocumentQuery, type IdType } from "../types.js";
import { SCOPE_FIELDS, copyScope, type ScopeInput } from "../scope.js";

/** The fields of a write target. */
export interface TargetInput extends ScopeInput {
  /** The filter of the documents to change. An empty filter needs `confirm: true`. */
  filter?: DocumentQuery;
  /** The ID of one document (the alternative to `filter`). */
  id?: string;
  /** How to read the ID (default: "auto", which matches an ObjectId or a string). */
  idType?: IdType;
  /** Change all matching documents, not only the first one. */
  multi?: boolean;
  /** Set to true to use an empty filter (it matches every document). */
  confirm?: boolean;
}

const TARGET_FIELDS = ["filter", "id", "idType", "multi", "confirm", ...SCOPE_FIELDS] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoolean(procedure: string, raw: Record<string, unknown>, field: string): boolean | undefined {
  const value = raw[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${procedure}: ${field} must be a boolean`);
  return value;
}

/**
 * This function reads and checks the target fields of a write input.
 * `extraFields` are the other fields that the procedure accepts.
 */
export function parseTarget(
  procedure: string,
  data: unknown,
  extraFields: readonly string[] = [],
): { target: TargetInput; raw: Record<string, unknown> } {
  if (!isPlainObject(data)) {
    throw new Error(`${procedure}: input must be an object`);
  }
  const raw = data;
  const allowed = new Set<string>([...TARGET_FIELDS, ...extraFields]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      const hint = key === "query" ? ' Use "filter".' : "";
      throw new Error(`${procedure}: unknown field "${key}".${hint} The fields are: ${[...allowed].join(", ")}`);
    }
  }

  const hasId = raw["id"] !== undefined;
  const hasFilter = raw["filter"] !== undefined;
  if (hasId === hasFilter) {
    throw new Error(`${procedure}: give exactly one of id or filter`);
  }

  const target: TargetInput = {};
  copyScope(raw, target);

  if (hasId) {
    const id = raw["id"];
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${procedure}: id must be a non-empty string`);
    }
    target.id = id;
  } else {
    const filter = raw["filter"];
    if (!isPlainObject(filter)) {
      throw new Error(`${procedure}: filter must be an object`);
    }
    target.filter = filter as DocumentQuery;
  }

  const idType = raw["idType"];
  if (idType !== undefined) {
    if (idType !== "auto" && idType !== "objectId" && idType !== "string") {
      throw new Error(`${procedure}: idType must be "auto", "objectId" or "string"`);
    }
    target.idType = idType;
  }

  const multi = optionalBoolean(procedure, raw, "multi");
  const confirm = optionalBoolean(procedure, raw, "confirm");
  if (multi !== undefined) target.multi = multi;
  if (confirm !== undefined) target.confirm = confirm;

  if (target.filter && Object.keys(target.filter).length === 0 && confirm !== true) {
    throw new Error(`${procedure}: an empty filter matches every document. Set confirm: true to use it.`);
  }

  return { target, raw };
}

/** The filter of a target. */
export function targetFilter(target: TargetInput): Document {
  return target.id !== undefined ? buildIdFilter(target.id, target.idType) : (target.filter as Document);
}

/**
 * The filter of an upsert by ID. It names one exact `_id`.
 *
 * In the "auto" mode the ID filter is `$or` of the ObjectId and the string form. MongoDB cannot
 * take an `_id` from `$or`, so each upsert inserted a new document with a new ID (deep dive
 * DATA-15). This function uses the `_id` of the existing document, or the ObjectId form when no
 * document matches.
 */
export async function upsertFilter(collection: Collection<Document>, target: TargetInput): Promise<Document> {
  const filter = targetFilter(target);
  if (target.id === undefined || !("$or" in filter)) return filter;
  const existing = await collection.findOne(filter, { projection: { _id: 1 } });
  return { _id: existing ? existing["_id"] : new ObjectId(target.id) };
}
