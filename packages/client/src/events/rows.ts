/**
 * The rows of a published value (roadmap CLI-15).
 *
 * A value on the bus can hold rows of data: the values of a collection change event, for example.
 * The publisher of the remote events gives each row to the output filter of the host (`admitItem`)
 * for each subscriber, and each subscriber gets only the rows that its filter admits. Thus a row
 * reaches a subscriber only through the same filter as a read.
 *
 * The rows are on a symbol key, so they stay in this process: JSON does not take them.
 *
 * The rows can have a rule of their own too (`admit`): the rule of the rows of a collection
 * (roadmap CLI-41). Each subscriber applies it after the filter of the host, with the invocation
 * of its subscription.
 */
import type { AdmitItem, Invocation } from "../procedures/invoke.js";

/** The rows of a published value, and the function that makes the value of the admitted rows. */
export interface PublishedRows {
  /** The rows that the output filter examines, one at a time. */
  readonly rows: readonly unknown[];
  /** This function gives the value for a subscriber: `admitted[i]` tells if row `i` stays. */
  keep(admitted: readonly boolean[]): unknown;
  /** The rule of the rows themselves, with the invocation of the subscription. A row stays only when it gives true. */
  readonly admit?: AdmitItem | undefined;
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
 * The value of a published value for one subscriber: each row passes the filter of the host and
 * the rule of the rows, and the value keeps the admitted rows. An error of a filter refuses the
 * row. A rule of the rows refuses each row of a subscription without an invocation. Without rows,
 * or without a filter and a rule, the value stays as it is.
 */
export async function admittedValue(value: unknown, admit: ((item: unknown) => Promise<boolean>) | undefined, invocation?: Invocation): Promise<unknown> {
  const rows = rowsOf(value);
  const own = rows?.admit;
  if (!rows || (!admit && !own)) return value;
  const admits = async (row: unknown): Promise<boolean> => {
    if (admit && !(await admit(row))) return false;
    return !own || (invocation !== undefined && (await own(row, invocation)) === true);
  };
  const admitted = await Promise.all(rows.rows.map((row) => admits(row).catch(() => false)));
  return rows.keep(admitted);
}
