/**
 * Procedure Definition Helper
 *
 * Factory function for creating well-typed procedure definitions.
 */
// =============================================================================
// Define Procedure
// =============================================================================
/**
 * Define a procedure with type inference from schemas.
 *
 * Creates a well-typed procedure definition that can be registered
 * with the procedure registry.
 *
 * @param definition - Procedure definition with path, schemas, and optional handler
 * @returns Fully typed procedure object
 *
 * @example
 * ```typescript
 * const getUserProcedure = defineProcedure({
 *   path: ['users', 'get'],
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string(), email: z.string() }),
 *   metadata: {
 *     description: 'Get user by ID',
 *     tags: ['users', 'read'],
 *   },
 *   handler: async ({ id }, ctx) => {
 *     const storage = ctx.repository?.getStorage<User>('users');
 *     const user = await storage?.get(id);
 *     if (!user) throw new Error('User not found');
 *     return user;
 *   },
 * });
 * ```
 */
export function defineProcedure(definition) {
    const procedure = {
        path: definition.path,
        input: definition.input,
        output: definition.output,
        metadata: (definition.metadata ?? {}),
    };
    // Only set handler if provided (exactOptionalPropertyTypes)
    if (definition.handler) {
        procedure.handler = definition.handler;
    }
    return procedure;
}
/**
 * Define a procedure stub without handler.
 * Useful for client-side type definitions.
 *
 * @param stub - Procedure stub with path and schemas
 * @returns Procedure object without handler
 *
 * @example
 * ```typescript
 * // Client-side stub for type inference
 * const getUserStub = defineStub({
 *   path: ['users', 'get'],
 *   input: z.object({ id: z.string() }),
 *   output: z.object({ id: z.string(), name: z.string() }),
 * });
 * ```
 */
export function defineStub(stub) {
    return {
        path: stub.path,
        input: stub.input,
        output: stub.output,
        metadata: stub.metadata ?? {},
    };
}
// =============================================================================
// Procedure Builder (Fluent API)
// =============================================================================
/**
 * Fluent builder for procedure definitions.
 * Provides a chainable API for building procedures.
 */
export class ProcedureBuilder {
    _path = [];
    _input;
    _output;
    _metadata = {};
    _handler;
    /**
     * Set the procedure path.
     */
    path(path) {
        this._path = path;
        return this;
    }
    /**
     * Set the input schema.
     */
    input(schema) {
        const builder = this;
        builder._input = schema;
        return builder;
    }
    /**
     * Set the output schema.
     */
    output(schema) {
        const builder = this;
        builder._output = schema;
        return builder;
    }
    /**
     * Set procedure metadata.
     */
    meta(metadata) {
        const builder = this;
        builder._metadata = metadata;
        return builder;
    }
    /**
     * Set the handler implementation.
     */
    handler(fn) {
        this._handler = fn;
        return this;
    }
    /**
     * Build the procedure definition.
     *
     * @throws Error if path, input, or output are not set
     */
    build() {
        if (this._path.length === 0) {
            throw new Error("Procedure path is required");
        }
        if (!this._input) {
            throw new Error("Input schema is required");
        }
        if (!this._output) {
            throw new Error("Output schema is required");
        }
        const procedure = {
            path: this._path,
            input: this._input,
            output: this._output,
            metadata: this._metadata,
        };
        // Only set handler if provided (exactOptionalPropertyTypes)
        if (this._handler) {
            procedure.handler = this._handler;
        }
        return procedure;
    }
}
/**
 * Create a new procedure builder.
 *
 * @example
 * ```typescript
 * const procedure = createProcedure()
 *   .path(['users', 'get'])
 *   .input(z.object({ id: z.string() }))
 *   .output(z.object({ id: z.string(), name: z.string() }))
 *   .meta({ description: 'Get user by ID' })
 *   .handler(async ({ id }, ctx) => {
 *     // Implementation
 *   })
 *   .build();
 * ```
 */
export function createProcedure() {
    return new ProcedureBuilder();
}
// =============================================================================
// Namespace Helper
// =============================================================================
/**
 * Create procedures under a common namespace.
 * Automatically prefixes all procedure paths.
 *
 * @param namespace - Namespace path prefix
 * @param procedures - Procedures to namespace
 * @returns Procedures with prefixed paths
 *
 * @example
 * ```typescript
 * const collectionProcedures = namespace(['collections', 'users'], [
 *   defineProcedure({
 *     path: ['get'],  // Becomes ['collections', 'users', 'get']
 *     input: z.object({ id: z.string() }),
 *     output: userSchema,
 *   }),
 *   defineProcedure({
 *     path: ['set'],  // Becomes ['collections', 'users', 'set']
 *     input: z.object({ id: z.string(), value: userSchema }),
 *     output: z.void(),
 *   }),
 * ]);
 * ```
 */
export function namespace(namespacePath, procedures) {
    return procedures.map((proc) => ({
        ...proc,
        path: [...namespacePath, ...proc.path],
    }));
}
// =============================================================================
// Validation Helpers
// =============================================================================
/**
 * Validate a procedure definition.
 * Throws if the definition is invalid.
 *
 * @param procedure - Procedure to validate
 * @throws Error if validation fails
 */
export function validateProcedure(procedure) {
    if (!procedure.path || procedure.path.length === 0) {
        throw new Error("Procedure path cannot be empty");
    }
    for (const segment of procedure.path) {
        if (typeof segment !== "string" || segment.length === 0) {
            throw new Error(`Invalid path segment: ${segment}`);
        }
        if (segment.includes(".")) {
            throw new Error(`Path segment cannot contain dots: ${segment}`);
        }
    }
    if (!procedure.input || typeof procedure.input.parse !== "function") {
        throw new Error("Input schema must have a parse method");
    }
    if (!procedure.output || typeof procedure.output.parse !== "function") {
        throw new Error("Output schema must have a parse method");
    }
}
//# sourceMappingURL=define.js.map