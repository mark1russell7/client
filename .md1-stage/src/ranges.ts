/**
 * The byte ranges of a file that a store has, and the chunk plan of the bytes that it does not have.
 *
 * Chunks go in parallel, so they arrive in any order. Thus the store keeps a set of ranges, not one count. A range is
 * half-open: `start` is the first byte, and `end` is the byte after the last. A range set is in its normal form when
 * its ranges are sorted, not empty, and have a gap between each two. Each function here gives the normal form.
 *
 * This copy is temporary. Its home is `RangeSet` of `@mark1russell7/collections`, a set of integer intervals. When
 * that set is on npm, this package imports it, and this file goes.
 */

/** A half-open range of bytes: from `start` to `end - 1`. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** This function tells if a value is a range with two safe integers and `0 <= start <= end`. */
export function isByteRange(value: unknown): value is ByteRange {
  if (value === null || typeof value !== "object") return false;
  const { start, end } = value as { start?: unknown; end?: unknown };
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && (start as number) >= 0 && (start as number) <= (end as number);
}

function requireRange(range: ByteRange): void {
  if (!isByteRange(range)) {
    throw new RangeError(`The range ${JSON.stringify(range)} is not a byte range: it needs safe integers with 0 <= start <= end`);
  }
}

/** This function gives the normal form of a list of ranges. The ranges that touch or overlap become one range. */
export function normalizeRanges(ranges: readonly ByteRange[]): ByteRange[] {
  ranges.forEach(requireRange);
  const sorted = ranges.filter((range) => range.end > range.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: ByteRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      if (range.end > last.end) merged[merged.length - 1] = { start: last.start, end: range.end };
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

/** This function adds one range to a range set, and gives the normal form. */
export function addRange(ranges: readonly ByteRange[], range: ByteRange): ByteRange[] {
  return normalizeRanges([...ranges, range]);
}

/** This function gives the number of bytes in a range set. An overlap counts once. */
export function rangeBytes(ranges: readonly ByteRange[]): number {
  return normalizeRanges(ranges).reduce((total, range) => total + range.end - range.start, 0);
}

function requireSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError(`The size ${size} is not a safe integer of 0 or more`);
}

/** This function gives the ranges of `0` to `size` that are not in the range set. A byte at `size` or after is ignored. */
export function missingRanges(size: number, ranges: readonly ByteRange[]): ByteRange[] {
  requireSize(size);
  const gaps: ByteRange[] = [];
  let at = 0;
  for (const range of normalizeRanges(ranges)) {
    if (range.start >= size) break;
    if (range.start > at) gaps.push({ start: at, end: range.start });
    at = Math.max(at, range.end);
  }
  if (at < size) gaps.push({ start: at, end: size });
  return gaps;
}

/**
 * This function gives the chunks that send the missing bytes of a file. Each chunk is in one cell of the grid of
 * `chunkSize`, so a chunk after a cut has the same bounds as before the cut. Each chunk has `chunkSize` bytes or fewer.
 */
export function planChunks(size: number, chunkSize: number, received: readonly ByteRange[] = []): ByteRange[] {
  requireSize(size);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new RangeError(`The chunk size ${chunkSize} is not a safe integer of 1 or more`);
  const chunks: ByteRange[] = [];
  for (const gap of missingRanges(size, received)) {
    let start = gap.start;
    while (start < gap.end) {
      const end = Math.min(gap.end, (Math.floor(start / chunkSize) + 1) * chunkSize);
      chunks.push({ start, end });
      start = end;
    }
  }
  return chunks;
}
