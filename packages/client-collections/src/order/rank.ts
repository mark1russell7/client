/** A point, for example the center of an item on the screen. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * This function gives a rank between the ranks of two neighbors. Without the previous neighbor, the
 * rank comes before the next one. Without the next neighbor, it comes after the previous one. A list
 * with no items gives 0.
 *
 * @example
 * ```ts
 * rankBetween(1, 2); // 1.5
 * rankBetween(undefined, 4); // 3, the start of the list
 * ```
 */
export function rankBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return (next as number) - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

/**
 * This function gives the index at which a point goes among the items of a list on the screen, in
 * reading order: the rows from top to bottom, and each row from left to right. It is the index of the
 * first item whose center comes after the point. A center within `rowTolerance` of the point on the
 * vertical axis is in the row of the point.
 *
 * @example
 * ```ts
 * const index = dropIndex(pointer, items.map(centerOf));
 * const rank = rankBetween(ranks[index - 1], ranks[index]);
 * ```
 */
export function dropIndex(point: Point, centers: readonly Point[], rowTolerance = 24): number {
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]!;
    if (point.y < c.y - rowTolerance) return i;
    if (Math.abs(point.y - c.y) <= rowTolerance && point.x < c.x) return i;
  }
  return centers.length;
}
