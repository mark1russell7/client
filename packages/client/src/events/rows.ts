/**
 * The rows of a published value (roadmap CLI-15).
 *
 * A value on the bus can hold rows of data: the values of a collection change event, for example.
 * The publisher of the remote events gives each row to the output filter of the host (`admitItem`)
 * for each subscriber, and each subscriber gets only the rows that its filter admits. Thus a row
 * reaches a subscriber only through the same filter as a read.
 *
 * The rows are on a symbol key, so they stay in this process: JSON does not take them.
 */

/** The rows of a published value, and the function that makes the value of the admitted rows. */
export interface PublishedRows {
  /** The rows that the output filter examines, one at a time. */
  readonly rows: readonly unknown[];
  /** This function gives the value for a subscriber: `admitted[i]` tells if row `i` stays. */
  keep(admitted: readonly boolean[]): unknown;
}

/** The key of the rows of a published value. */
const ROWS: unique symbol = Symbol.for("procedures.publishedRows");

/**
 * This function gives the value with its rows, for the filter of each subscriber. The rows are not
 * enumerable: a copy or a comparison of the value does not see them.
 */
export function withRows<T extends object>(value: T, rows: PublishedRows): T {
  return Object.defineProperty(value, ROWS, { value: rows, enumerable: false });
}

/** The rows of a published value, or undefined for a value without rows. */
export function rowsOf(value: unknown): PublishedRows | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rows = (value as { [ROWS]?: unknown })[ROWS];
  return typeof rows === "object" && rows !== null ? (rows as PublishedRows) : undefined;
}

/**
 * The value of a published value for one subscriber: each row passes the filter, and the value
 * keeps the admitted rows. An error of the filter refuses the row. Without rows or a filter, the
 * value stays as it is.
 */
export async function admittedValue(value: unknown, admit: ((item: unknown) => Promise<boolean>) | undefined): Promise<unknown> {
  const rows = rowsOf(value);
  if (!rows || !admit) return value;
  const admitted = await Promise.all(rows.rows.map((row) => admit(row).catch(() => false)));
  return rows.keep(admitted);
}
