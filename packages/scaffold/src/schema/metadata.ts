/**
 * METADATA_KEY for schema nodes
 *
 * This is a string with a statically generated UUIDv6 prefix to ensure
 * 0% collision chance with actual filesystem keys (no file would ever
 * be named "__$scaffold_...").
 *
 * Using a string (rather than Symbol) allows for better TypeScript
 * isolatedDeclarations compatibility while maintaining uniqueness.
 */
export const METADATA_KEY: "__$scaffold_meta_01944a8c7d00$__" =
  "__$scaffold_meta_01944a8c7d00$__";

/**
 * Type for the metadata key (for use in type definitions)
 */
export type MetadataKeyType = typeof METADATA_KEY;
