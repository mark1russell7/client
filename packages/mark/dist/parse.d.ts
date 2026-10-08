/**
 * Schema-based CLI Argument Parser
 *
 * Parses CLI arguments based on procedure metadata.
 * Validation is delegated to the procedure's schema.
 */
/**
 * CLI metadata that can be attached to procedures via .meta()
 */
export interface CLIMeta {
    /** Description for help text */
    description?: string;
    /** Field names that are positional args (in order) */
    args?: string[];
    /** Short flag mappings: { fieldName: "f" } */
    shorts?: Record<string, string>;
    /** Output format hint */
    output?: "text" | "json" | "table" | "streaming";
    /** Whether to prompt for missing required fields */
    interactive?: boolean;
}
/**
 * Extracted schema field info for help generation
 */
export interface SchemaFieldInfo {
    name: string;
    type: string;
    required: boolean;
    description: string | undefined;
    defaultValue: unknown;
    enumValues: readonly string[] | undefined;
}
/**
 * Extract field information from a Zod-like schema
 */
export declare function extractSchemaFields(schema: unknown): SchemaFieldInfo[];
/**
 * Gluegun parameters shape
 */
export interface Parameters {
    first?: string;
    second?: string;
    third?: string;
    array?: string[];
    options?: Record<string, unknown>;
    raw?: string[];
    string?: string;
}
/**
 * Parse CLI parameters into procedure input based on metadata
 */
export declare function parseFromSchema(params: Parameters, meta: CLIMeta): Record<string, unknown>;
/**
 * Generate help text for a procedure based on its metadata and schema
 */
export declare function generateHelp(path: string[], meta: CLIMeta, schema?: unknown): string;
//# sourceMappingURL=parse.d.ts.map