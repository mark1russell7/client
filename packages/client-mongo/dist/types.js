/**
 * TypeScript types for client-mongo procedures
 */
/**
 * Type guard to check if metadata has collection
 */
export function hasCollection(metadata) {
    return typeof metadata["collection"] === "string";
}
/**
 * Type guard to get collection metadata, throws if missing
 */
export function requireCollection(metadata) {
    if (!hasCollection(metadata)) {
        throw new Error("collection is required in metadata");
    }
    return metadata;
}
/**
 * Get base metadata (database override).
 * BaseMeta extends Record<string, unknown> so this is type-safe.
 */
export function getBaseMeta(metadata) {
    return metadata;
}
//# sourceMappingURL=types.js.map