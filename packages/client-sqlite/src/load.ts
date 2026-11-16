/**
 * The main entry of `@mark1russell7/sqlite`, loaded at its first use. The procedures and the storage load it, and with
 * it `node:sqlite`, only when they open a database. An import of this package does not load them.
 */

/** The main entry of `@mark1russell7/sqlite`. */
export type Sqlite = typeof import("@mark1russell7/sqlite");

let loading: Promise<Sqlite> | undefined;

/** This function loads the main entry of `@mark1russell7/sqlite` one time. */
export function loadSqlite(): Promise<Sqlite> {
  loading ??= import("@mark1russell7/sqlite");
  return loading;
}
