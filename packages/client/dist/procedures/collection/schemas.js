/**
 * Collection Operation Schemas
 *
 * Zod-compatible schemas for collection CRUD operations.
 * These schemas are used for input/output validation in collection procedures.
 */
// =============================================================================
// Generic Schema Builder
// =============================================================================
/**
 * Create a ZodLike schema from a validation function.
 * Useful for creating schemas without Zod dependency.
 */
function createSchema(validate) {
    return {
        parse(data) {
            const result = validate(data);
            if (result.success) {
                return result.data;
            }
            throw new Error(result.error.message);
        },
        safeParse(data) {
            return validate(data);
        },
    };
}
/**
 * Simple string validation.
 */
function isString(value) {
    return typeof value === "string";
}
/**
 * Simple array validation.
 */
function isArray(value) {
    return Array.isArray(value);
}
/**
 * Simple object validation.
 */
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
// =============================================================================
// Common Schemas
// =============================================================================
/**
 * Schema for item ID.
 */
export const idSchema = createSchema((data) => {
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
export const collectionNameSchema = createSchema((data) => {
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
export const valueSchema = createSchema((data) => {
    // Accept any JSON-serializable value
    try {
        JSON.stringify(data);
        return { success: true, data };
    }
    catch {
        return {
            success: false,
            error: {
                message: "Value must be JSON-serializable",
                errors: [{ path: ["value"], message: "Value must be JSON-serializable" }],
            },
        };
    }
});
export const getInputSchema = createSchema((data) => {
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
export const getOutputSchema = createSchema((data) => {
    // Accept any value (item) or undefined
    return { success: true, data };
});
export const setInputSchema = createSchema((data) => {
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
export const setOutputSchema = createSchema((_data) => {
    return { success: true, data: undefined };
});
export const deleteInputSchema = createSchema((data) => {
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
export const deleteOutputSchema = createSchema((data) => {
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
export const hasInputSchema = createSchema((data) => {
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
export const hasOutputSchema = createSchema((data) => {
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
export const getAllInputSchema = createSchema((data) => {
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
export const getAllOutputSchema = createSchema((data) => {
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
export const sizeInputSchema = createSchema((data) => {
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
export const sizeOutputSchema = createSchema((data) => {
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
export const clearInputSchema = createSchema((data) => {
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
export const clearOutputSchema = createSchema((_data) => {
    return { success: true, data: undefined };
});
export const getBatchInputSchema = createSchema((data) => {
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
    return { success: true, data: { ids: data.ids } };
});
/**
 * Output for getBatch operation - object mapping ids to values.
 */
export const getBatchOutputSchema = createSchema((data) => {
    if (isObject(data)) {
        return { success: true, data: data };
    }
    return {
        success: false,
        error: {
            message: "Output must be an object",
            errors: [{ path: [], message: "Output must be an object" }],
        },
    };
});
export const setBatchInputSchema = createSchema((data) => {
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
            items: data.items.map((item) => ({ id: item.id, value: item.value })),
        },
    };
});
/**
 * Output for setBatch operation - void.
 */
export const setBatchOutputSchema = createSchema((_data) => {
    return { success: true, data: undefined };
});
export const deleteBatchInputSchema = createSchema((data) => {
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
    return { success: true, data: { ids: data.ids } };
});
/**
 * Output for deleteBatch operation - number of deleted items.
 */
export const deleteBatchOutputSchema = createSchema((data) => {
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
//# sourceMappingURL=schemas.js.map