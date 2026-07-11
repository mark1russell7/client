/**
 * Schema Helpers
 *
 * Wraps Zod schemas for the client procedure system.
 */

/**
 * Wrap a Zod schema for use with client procedures
 */
export { zodAdapter as wrapSchema } from "@mark1russell7/client";

/**
 * Create a pass-through schema for type T (no validation)
 */
export { outputSchema as schema } from "@mark1russell7/client";
