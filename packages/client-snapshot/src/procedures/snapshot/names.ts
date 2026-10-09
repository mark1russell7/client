/**
 * Names and exclusion rules of snapshots.
 */

/** A snapshot name or id: letters, digits, ".", "_" and "-", and not ".." (it goes into paths and S3 keys). */
const SNAPSHOT_NAME = /^[A-Za-z0-9._-]+$/;

export function assertSnapshotName(field: string, value: string): void {
  if (!SNAPSHOT_NAME.test(value) || value.includes("..")) {
    throw new Error(`Invalid snapshot ${field}: ${JSON.stringify(value)} (use letters, digits, ".", "_" and "-")`);
  }
}

/**
 * True when an archive entry is excluded: a pattern matches a whole path segment ("dist"
 * excludes `dist/` but not `src/distance.ts`), or, for "*.ext", the end of the file name.
 */
export function isExcluded(entryPath: string, patterns: readonly string[]): boolean {
  const segments = entryPath.split(/[\\/]/).filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1] ?? "";
  return patterns.some((pattern) =>
    pattern.startsWith("*.") ? last.endsWith(pattern.slice(1)) : segments.includes(pattern),
  );
}
