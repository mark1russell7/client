/**
 * Collection Operation Schemas
 *
 * Zod-compatible schemas for collection CRUD operations.
 * These schemas are used for input/output validation in collection procedures.
 */

import type { ZodLike, ZodErrorLike } from "../../client/validation/types.js";
import { patchProblems, queryOptionsProblems, selectorProblems, type StoragePatch, type StorageSelector, type StorageSort } from "./query.js";

// =============================================================================
// Generic Schema Builder
// =============================================================================

/**
 * Create a ZodLike schema from a validation function.
 * Useful for creating schemas without Zod dependency.
 */
function createSchema<T>(
  validate: (data: unknown) => { success: true; data: T } | { success: false; error: ZodErrorLike }
): ZodLike<T> {
  return {
    parse(data: unknown): T {
      const result = validate(data);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.message);
    },
    safeParse(data: unknown) {
      return validate(data);
    },
  };
}

/**
 * Simple string validation.
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Simple array validation.
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Simple object validation.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Schema for item ID.
 */
export const idSchema : ZodLike<string> = createSchema<string>((data) => {
  if (isString(data) && data.length > 0) {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "ID must be a non-empty string",
      errors: [{ path: ["id"], message: "ID must be a non-empty string" }],
    },
  };
});

/**
 * Schema for collection name.
 */
export const collectionNameSchema : ZodLike<string> = createSchema<string>((data) => {
  if (isString(data) && data.length > 0 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(data)) {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "Collection name must be a valid identifier",
      errors: [{ path: ["collection"], message: "Collection name must start with a letter and contain only alphanumerics and underscores" }],
    },
  };
});

/**
 * Schema for generic value (any JSON-serializable value).
 */
export const valueSchema : ZodLike<unknown> = createSchema<unknown>((data) => {
  // Accept any JSON-serializable value
  try {
    JSON.stringify(data);
    return { success: true, data };
  } catch {
    return {
      success: false,
      error: {
        message: "Value must be JSON-serializable",
        errors: [{ path: ["value"], message: "Value must be JSON-serializable" }],
      },
    };
  }
});

// =============================================================================
// Get Operation Schemas
// =============================================================================

/**
 * Input for get operation.
 */
export interface GetInput {
  id: string;
  /**
   * True: the output is `{ found, value }` (a `GetFoundOutput`), so a stored `null` and a missing
   * id give different outputs. Without it, the output is the item, or `null` on the wire for a
   * missing id. `ApiStorage` of `@procedures/store` sends it.
   */
  found?: boolean;
}

export const getInputSchema : ZodLike<GetInput> = createSchema<GetInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data["id"]) || data["id"].length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  const found = data["found"];
  if (found !== undefined && typeof found !== "boolean") {
    return {
      success: false,
      error: {
        message: "found must be a boolean",
        errors: [{ path: ["found"], message: "found must be a boolean" }],
      },
    };
  }
  return { success: true, data: found === true ? { id: data["id"], found: true } : { id: data["id"] } };
});

/**
 * The output of `get` with `found: true` in the input. `found` is true when the collection has
 * the id. Then `value` is the item, also when the item is `null`.
 */
export interface GetFoundOutput {
  found: boolean;
  value?: unknown;
}

/**
 * Output for get operation: the item, or undefined for a missing id. With `found: true` in the
 * input, the output is a `GetFoundOutput`.
 */
export const getOutputSchema : ZodLike<unknown> = createSchema<unknown>((data) => {
  // Accept any value (item) or undefined
  return { success: true, data };
});

// =============================================================================
// Set Operation Schemas
// =============================================================================

/**
 * Input for set operation.
 */
export interface SetInput {
  id: string;
  value: unknown;
}

export const setInputSchema : ZodLike<SetInput> = createSchema<SetInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data["id"]) || data["id"].length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  if (!("value" in data)) {
    return {
      success: false,
      error: {
        message: "value is required",
        errors: [{ path: ["value"], message: "value is required" }],
      },
    };
  }
  return { success: true, data: { id: data["id"], value: data["value"] } };
});

/**
 * Output for set operation - void.
 */
export const setOutputSchema : ZodLike<void> = createSchema<void>((_data) => {
  return { success: true, data: undefined };
});

// =============================================================================
// Delete Operation Schemas
// =============================================================================

/**
 * Input for delete operation.
 */
export interface DeleteInput {
  id: string;
}

export const deleteInputSchema : ZodLike<DeleteInput> = createSchema<DeleteInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data["id"]) || data["id"].length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  return { success: true, data: { id: data["id"] } };
});

/**
 * Output for delete operation - boolean indicating if deleted.
 */
export const deleteOutputSchema : ZodLike<boolean> = createSchema<boolean>((data) => {
  if (typeof data === "boolean") {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "Output must be a boolean",
      errors: [{ path: [], message: "Output must be a boolean" }],
    },
  };
});

// =============================================================================
// Has Operation Schemas
// =============================================================================

/**
 * Input for has operation.
 */
export interface HasInput {
  id: string;
}

export const hasInputSchema : ZodLike<HasInput> = createSchema<HasInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data["id"]) || data["id"].length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  return { success: true, data: { id: data["id"] } };
});

/**
 * Output for has operation - boolean.
 */
export const hasOutputSchema : ZodLike<boolean> = createSchema<boolean>((data) => {
  if (typeof data === "boolean") {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "Output must be a boolean",
      errors: [{ path: [], message: "Output must be a boolean" }],
    },
  };
});

// =============================================================================
// GetAll Operation Schemas
// =============================================================================

/**
 * Input for getAll operation - empty object.
 */
export interface GetAllInput {}

export const getAllInputSchema : ZodLike<GetAllInput> = createSchema<GetAllInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  return { success: true, data: {} };
});

/**
 * Output for getAll operation - array of items.
 */
export const getAllOutputSchema : ZodLike<unknown[]> = createSchema<unknown[]>((data) => {
  if (isArray(data)) {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "Output must be an array",
      errors: [{ path: [], message: "Output must be an array" }],
    },
  };
});

// =============================================================================
// Entries Operation Schemas
// =============================================================================

/**
 * Input for entries operation - empty object.
 */
export interface EntriesInput {}

export const entriesInputSchema : ZodLike<EntriesInput> = createSchema<EntriesInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  return { success: true, data: {} };
});

/** One item of a collection with its id. */
export interface CollectionEntry {
  id: string;
  value: unknown;
}

/**
 * Output for entries operation - each item with its id. A sync needs the ids: `getAll` gives
 * only the values (roadmap R2).
 */
export const entriesOutputSchema : ZodLike<CollectionEntry[]> = createSchema<CollectionEntry[]>((data) => {
  if (isArray(data) && data.every((entry) => isObject(entry) && isString(entry["id"]) && "value" in entry)) {
    return { success: true, data: data as CollectionEntry[] };
  }
  return {
    success: false,
    error: {
      message: "Output must be an array of { id, value } objects",
      errors: [{ path: [], message: "Output must be an array of { id, value } objects" }],
    },
  };
});

// =============================================================================
// Find Operation Schemas
// =============================================================================

/**
 * Input for find operation: a JSON selector, and the order, the skip and the limit. The selector
 * is the selector of `query()` of `@procedures/collections`.
 */
export interface FindInput {
  /** The selector. Without it, each item matches. */
  selector?: StorageSelector;
  /** The order of the result: field paths with 1 (ascending) or -1 (descending). */
  sort?: StorageSort;
  /** The number of items to skip after the sort. */
  skip?: number;
  /** The largest number of items in the result. */
  limit?: number;
}

/** The problems of a find input, as the errors of a schema. */
function findErrors(data: Record<string, unknown>): Array<{ path: Array<string | number>; message: string }> {
  const errors: Array<{ path: Array<string | number>; message: string }> = [];
  for (const key of Object.keys(data)) {
    if (data[key] !== undefined && key !== "selector" && key !== "sort" && key !== "skip" && key !== "limit") {
      errors.push({ path: [key], message: `${key} is not a field of the input: use selector, sort, skip and limit` });
    }
  }
  if (data["selector"] !== undefined) {
    for (const message of selectorProblems(data["selector"])) errors.push({ path: ["selector"], message });
  }
  const options = { sort: data["sort"], skip: data["skip"], limit: data["limit"] };
  for (const message of queryOptionsProblems(options)) errors.push({ path: [/^(sort|skip|limit)/.exec(message)?.[1] ?? "options"], message });
  return errors;
}

export const findInputSchema : ZodLike<FindInput> = createSchema<FindInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  const errors = findErrors(data);
  if (errors.length > 0) {
    return { success: false, error: { message: errors.map((error) => error.message).join(". "), errors } };
  }
  const input: FindInput = {};
  if (data["selector"] !== undefined) input.selector = data["selector"] as StorageSelector;
  if (data["sort"] !== undefined) input.sort = data["sort"] as StorageSort;
  if (data["skip"] !== undefined) input.skip = data["skip"] as number;
  if (data["limit"] !== undefined) input.limit = data["limit"] as number;
  return { success: true, data: input };
});

/** Output for find operation: the matching items with their ids, in the order of the query. */
export const findOutputSchema : ZodLike<CollectionEntry[]> = createSchema<CollectionEntry[]>((data) => entriesOutputSchema.safeParse(data));

// =============================================================================
// Patch Operation Schemas
// =============================================================================

/**
 * Input for patch operation: the id, and the fields of a JSON Merge Patch (RFC 7386). Each field
 * replaces the field of the item, an object merges into an object field, and `null` removes a field.
 */
export interface PatchInput {
  id: string;
  fields: StoragePatch;
}

export const patchInputSchema : ZodLike<PatchInput> = createSchema<PatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data["id"]) || data["id"].length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  const [problem] = patchProblems(data["fields"]);
  if (problem !== undefined) {
    return {
      success: false,
      error: {
        message: problem,
        errors: [{ path: ["fields"], message: problem }],
      },
    };
  }
  return { success: true, data: { id: data["id"], fields: data["fields"] as StoragePatch } };
});

/**
 * Output for patch operation: `found` is true when the collection has the id. Then `value` is the
 * new item.
 */
export const patchOutputSchema : ZodLike<GetFoundOutput> = createSchema<GetFoundOutput>((data) => {
  if (isObject(data) && typeof data["found"] === "boolean") {
    return { success: true, data: data as unknown as GetFoundOutput };
  }
  return {
    success: false,
    error: {
      message: "Output must be { found, value }",
      errors: [{ path: [], message: "Output must be { found, value }" }],
    },
  };
});

// =============================================================================
// Ids Operation Schemas
// =============================================================================

/** Input for ids operation - empty object. */
export interface IdsInput {}

export const idsInputSchema : ZodLike<IdsInput> = createSchema<IdsInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  return { success: true, data: {} };
});

/**
 * Output for ids operation: the ids of the items, in the order of the entries, without the
 * values. A full sync needs only the ids.
 */
export const idsOutputSchema : ZodLike<string[]> = createSchema<string[]>((data) => {
  if (isArray(data) && data.every((id) => isString(id))) {
    return { success: true, data: data as string[] };
  }
  return {
    success: false,
    error: {
      message: "Output must be an array of ids",
      errors: [{ path: [], message: "Output must be an array of ids" }],
    },
  };
});

// =============================================================================
// Changes Operation Schemas
// =============================================================================

/** Input for changes operation: the version of an earlier call (roadmap R28). */
export interface ChangesInput {
  /** The `version` of an earlier result. Without it, the result has all items. */
  since?: string;
}

export const changesInputSchema : ZodLike<ChangesInput> = createSchema<ChangesInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  const since = data["since"];
  if (since !== undefined && !isString(since)) {
    return {
      success: false,
      error: {
        message: "since must be a string",
        errors: [{ path: ["since"], message: "since must be a string" }],
      },
    };
  }
  return { success: true, data: since === undefined ? {} : { since } };
});

/**
 * Output for changes operation: the items that changed after the version, the deleted ids, and
 * the new version. When `full` is true, `changed` has each item (roadmap R28).
 */
export interface ChangesOutput {
  version: string;
  full: boolean;
  changed: CollectionEntry[];
  deleted: string[];
}

export const changesOutputSchema : ZodLike<ChangesOutput> = createSchema<ChangesOutput>((data) => {
  if (
    isObject(data) &&
    isString(data["version"]) &&
    typeof data["full"] === "boolean" &&
    isArray(data["changed"]) &&
    data["changed"].every((entry) => isObject(entry) && isString(entry["id"]) && "value" in entry) &&
    isArray(data["deleted"]) &&
    data["deleted"].every((id) => isString(id))
  ) {
    return { success: true, data: data as unknown as ChangesOutput };
  }
  return {
    success: false,
    error: {
      message: "Output must be { version, full, changed: [{ id, value }], deleted: [id] }",
      errors: [{ path: [], message: "Output must be { version, full, changed: [{ id, value }], deleted: [id] }" }],
    },
  };
});

// =============================================================================
// Size Operation Schemas
// =============================================================================

/**
 * Input for size operation - empty object.
 */
export interface SizeInput {}

export const sizeInputSchema : ZodLike<SizeInput> = createSchema<SizeInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  return { success: true, data: {} };
});

/**
 * Output for size operation - number.
 */
export const sizeOutputSchema : ZodLike<number> = createSchema<number>((data) => {
  if (typeof data === "number" && Number.isInteger(data) && data >= 0) {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "Output must be a non-negative integer",
      errors: [{ path: [], message: "Output must be a non-negative integer" }],
    },
  };
});

// =============================================================================
// Clear Operation Schemas
// =============================================================================

/**
 * Input for clear operation - empty object.
 */
export interface ClearInput {}

export const clearInputSchema : ZodLike<ClearInput> = createSchema<ClearInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  return { success: true, data: {} };
});

/**
 * Output for clear operation - void.
 */
export const clearOutputSchema : ZodLike<void> = createSchema<void>((_data) => {
  return { success: true, data: undefined };
});

// =============================================================================
// Batch Operation Schemas
// =============================================================================

/**
 * Input for getBatch operation.
 */
export interface GetBatchInput {
  ids: string[];
}

export const getBatchInputSchema : ZodLike<GetBatchInput> = createSchema<GetBatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isArray(data["ids"]) || !data["ids"].every((id) => isString(id))) {
    return {
      success: false,
      error: {
        message: "ids must be an array of strings",
        errors: [{ path: ["ids"], message: "ids must be an array of strings" }],
      },
    };
  }
  return { success: true, data: { ids: data["ids"] as string[] } };
});

/**
 * Output for getBatch operation - object mapping ids to values.
 */
export const getBatchOutputSchema : ZodLike<Record<string, unknown>> = createSchema<Record<string, unknown>>((data) => {
  if (isObject(data)) {
    return { success: true, data: data as Record<string, unknown> };
  }
  return {
    success: false,
    error: {
      message: "Output must be an object",
      errors: [{ path: [], message: "Output must be an object" }],
    },
  };
});

/**
 * Input for setBatch operation.
 */
export interface SetBatchInput {
  items: Array<{ id: string; value: unknown }>;
}

export const setBatchInputSchema : ZodLike<SetBatchInput> = createSchema<SetBatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isArray(data["items"])) {
    return {
      success: false,
      error: {
        message: "items must be an array",
        errors: [{ path: ["items"], message: "items must be an array" }],
      },
    };
  }
  for (let i = 0; i < data["items"].length; i++) {
    const item = data["items"][i];
    if (!isObject(item) || !isString(item["id"]) || !("value" in item)) {
      return {
        success: false,
        error: {
          message: `items[${i}] must have id (string) and value`,
          errors: [{ path: ["items", i], message: "Each item must have id (string) and value" }],
        },
      };
    }
  }
  return {
    success: true,
    data: {
      items: data["items"].map((item: any) => ({ id: item["id"], value: item["value"] })),
    },
  };
});

/**
 * Output for setBatch operation - void.
 */
export const setBatchOutputSchema : ZodLike<void> = createSchema<void>((_data) => {
  return { success: true, data: undefined };
});

/**
 * Input for deleteBatch operation.
 */
export interface DeleteBatchInput {
  ids: string[];
}

export const deleteBatchInputSchema : ZodLike<DeleteBatchInput> = createSchema<DeleteBatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isArray(data["ids"]) || !data["ids"].every((id) => isString(id))) {
    return {
      success: false,
      error: {
        message: "ids must be an array of strings",
        errors: [{ path: ["ids"], message: "ids must be an array of strings" }],
      },
    };
  }
  return { success: true, data: { ids: data["ids"] as string[] } };
});

/**
 * Output for deleteBatch operation - number of deleted items.
 */
export const deleteBatchOutputSchema : ZodLike<number> = createSchema<number>((data) => {
  if (typeof data === "number" && Number.isInteger(data) && data >= 0) {
    return { success: true, data };
  }
  return {
    success: false,
    error: {
      message: "Output must be a non-negative integer",
      errors: [{ path: [], message: "Output must be a non-negative integer" }],
    },
  };
});
