/**
 * The database and the collection of a call.
 *
 * Each procedure reads `collection` and `database` from its input. The call metadata stays a
 * fallback for the clients that set it. (Before, only the metadata gave them, and an MCP tool
 * call cannot set metadata: deep dive DATA-5.)
 */

import type { Collection, Db, Document } from "mongodb";
import type { ProcedureContext } from "@mark1russell7/client";
import { ensureConnection } from "./connection.js";

/** The input fields that select the database and the collection. */
export interface ScopeInput {
  /** The collection name. It takes the place of `metadata.collection`. */
  collection?: string;
  /** The database name. It takes the place of `metadata.database` and the connection default. */
  database?: string;
}

/** The names of the scope fields, for the input parsers. */
export const SCOPE_FIELDS = ["collection", "database"] as const;

function optionalName(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

/** The database name of a call: the input, then the metadata. Undefined means the connection default. */
export function databaseName(input: ScopeInput, ctx: Pick<ProcedureContext, "metadata">): string | undefined {
  return optionalName(input.database, "database") ?? optionalName(ctx.metadata["database"], "metadata.database");
}

/** The collection name of a call: the input, then the metadata. */
export function collectionName(input: ScopeInput, ctx: Pick<ProcedureContext, "metadata">): string {
  const name = optionalName(input.collection, "collection") ?? optionalName(ctx.metadata["collection"], "metadata.collection");
  if (name === undefined) {
    throw new Error("collection is required: give it in the input (or in the call metadata)");
  }
  return name;
}

/** The database of a call. This function connects first when there is no open connection. */
export async function databaseFor(input: ScopeInput, ctx: Pick<ProcedureContext, "metadata">): Promise<Db> {
  const name = databaseName(input, ctx);
  const connection = await ensureConnection();
  return name ? connection.getClient().db(name) : connection.getDb();
}

/** The collection of a call. This function connects first when there is no open connection. */
export async function collectionFor(
  input: ScopeInput,
  ctx: Pick<ProcedureContext, "metadata">,
): Promise<{ collection: Collection<Document>; name: string; db: Db }> {
  const name = collectionName(input, ctx);
  const db = await databaseFor(input, ctx);
  return { collection: db.collection(name), name, db };
}

/** This function copies the scope fields of a raw input into a parsed input. */
export function copyScope(raw: Record<string, unknown>, parsed: ScopeInput): void {
  const collection = optionalName(raw["collection"], "collection");
  const database = optionalName(raw["database"], "database");
  if (collection !== undefined) parsed.collection = collection;
  if (database !== undefined) parsed.database = database;
}
