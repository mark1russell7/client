/**
 * Versions "MAJOR.MINOR.PATCH". The home page shows the newest of two versions: the version on
 * npm and the newest version of the changelogs.
 */

function partsOf(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** This function gives a negative number when `a` is older than `b`, a positive number when it is newer, else 0. */
export function compareVersions(a: string, b: string): number {
  const left = partsOf(a);
  const right = partsOf(b);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** This function gives the newer of two versions. A missing version loses. */
export function newerVersion(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareVersions(b, a) > 0 ? b : a;
}
