/**
 * TypeScript types for client-mongo procedures
 */
import { ObjectId } from "mongodb";
/**
 * Build an `_id` filter from a string id.
 *
 * MongoDB supports any `_id` type at runtime. Previously any string that parsed
 * as an ObjectId was silently coerced, making 24-hex *string* `_id`s
 * unreachable. The default `"auto"` mode now queries both forms via `$or` when
 * the id is ambiguous, and `idType` provides an explicit escape hatch.
 */
export function buildIdFilter(id, idType = "auto") {
    if (idType === "string") {
        return { _id: id };
    }
    let objectId = null;
    try {
        objectId = new ObjectId(id);
    }
    catch {
        objectId = null;
    }
    if (idType === "objectId") {
        return { _id: objectId ?? id };
    }
    // "auto": match both the ObjectId and the raw string when ambiguous.
    if (objectId) {
        return { $or: [{ _id: objectId }, { _id: id }] };
    }
    return { _id: id };
}
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
    if (metadata.collection.trim().length === 0) {
        throw new Error("collection must be a non-empty string");
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