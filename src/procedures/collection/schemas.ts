/**
 * Collection Operation Schemas
 *
 * Zod-compatible schemas for collection CRUD operations.
 * These schemas are used for input/output validation in collection procedures.
 */

import type { ZodLike, ZodErrorLike } from "../../client/validation/types";

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
export const idSchema = createSchema<string>((data) => {
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
export const collectionNameSchema = createSchema<string>((data) => {
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
export const valueSchema = createSchema<unknown>((data) => {
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
}

export const getInputSchema = createSchema<GetInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data.id) || data.id.length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  return { success: true, data: { id: data.id } };
});

/**
 * Output for get operation - the item or undefined.
 */
export const getOutputSchema = createSchema<unknown>((data) => {
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

export const setInputSchema = createSchema<SetInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data.id) || data.id.length === 0) {
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
  return { success: true, data: { id: data.id, value: data.value } };
});

/**
 * Output for set operation - void.
 */
export const setOutputSchema = createSchema<void>((_data) => {
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

export const deleteInputSchema = createSchema<DeleteInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data.id) || data.id.length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  return { success: true, data: { id: data.id } };
});

/**
 * Output for delete operation - boolean indicating if deleted.
 */
export const deleteOutputSchema = createSchema<boolean>((data) => {
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

export const hasInputSchema = createSchema<HasInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isString(data.id) || data.id.length === 0) {
    return {
      success: false,
      error: {
        message: "id must be a non-empty string",
        errors: [{ path: ["id"], message: "id must be a non-empty string" }],
      },
    };
  }
  return { success: true, data: { id: data.id } };
});

/**
 * Output for has operation - boolean.
 */
export const hasOutputSchema = createSchema<boolean>((data) => {
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

export const getAllInputSchema = createSchema<GetAllInput>((data) => {
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
export const getAllOutputSchema = createSchema<unknown[]>((data) => {
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
// Size Operation Schemas
// =============================================================================

/**
 * Input for size operation - empty object.
 */
export interface SizeInput {}

export const sizeInputSchema = createSchema<SizeInput>((data) => {
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
export const sizeOutputSchema = createSchema<number>((data) => {
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

export const clearInputSchema = createSchema<ClearInput>((data) => {
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
export const clearOutputSchema = createSchema<void>((_data) => {
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

export const getBatchInputSchema = createSchema<GetBatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isArray(data.ids) || !data.ids.every((id) => isString(id))) {
    return {
      success: false,
      error: {
        message: "ids must be an array of strings",
        errors: [{ path: ["ids"], message: "ids must be an array of strings" }],
      },
    };
  }
  return { success: true, data: { ids: data.ids as string[] } };
});

/**
 * Output for getBatch operation - object mapping ids to values.
 */
export const getBatchOutputSchema = createSchema<Record<string, unknown>>((data) => {
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

export const setBatchInputSchema = createSchema<SetBatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isArray(data.items)) {
    return {
      success: false,
      error: {
        message: "items must be an array",
        errors: [{ path: ["items"], message: "items must be an array" }],
      },
    };
  }
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (!isObject(item) || !isString(item.id) || !("value" in item)) {
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
      items: data.items.map((item: any) => ({ id: item.id, value: item.value })),
    },
  };
});

/**
 * Output for setBatch operation - void.
 */
export const setBatchOutputSchema = createSchema<void>((_data) => {
  return { success: true, data: undefined };
});

/**
 * Input for deleteBatch operation.
 */
export interface DeleteBatchInput {
  ids: string[];
}

export const deleteBatchInputSchema = createSchema<DeleteBatchInput>((data) => {
  if (!isObject(data)) {
    return {
      success: false,
      error: {
        message: "Input must be an object",
        errors: [{ path: [], message: "Input must be an object" }],
      },
    };
  }
  if (!isArray(data.ids) || !data.ids.every((id) => isString(id))) {
    return {
      success: false,
      error: {
        message: "ids must be an array of strings",
        errors: [{ path: ["ids"], message: "ids must be an array of strings" }],
      },
    };
  }
  return { success: true, data: { ids: data.ids as string[] } };
});

/**
 * Output for deleteBatch operation - number of deleted items.
 */
export const deleteBatchOutputSchema = createSchema<number>((data) => {
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
