/**
 * sqlite.transaction procedure (roadmap R44)
 *
 * The statements of the input run in order in one `BEGIN IMMEDIATE` transaction. When one fails, the procedure rolls back
 * the transaction: the database stays as it was. A statement that gives rows (SELECT, or RETURNING) gives them in its
 * result, so a later statement can follow an earlier one in the same transaction.
 */

import type { DbStatementResult, DbTransactionInput, DbTransactionOutput } from "../../types.js";
import { databasePath, errorText, runStatements, toSqlParams, withDatabase } from "./shared.js";

/**
 * Run statements in one transaction
 */
export async function dbTransaction(input: DbTransactionInput): Promise<DbTransactionOutput> {
  const mode = { procedure: "sqlite.transaction", missing: "make", queryOnly: false, callerSql: true } as const;
  return withDatabase(databasePath(input.dbPath), mode, (db, sqlite) => {
    const results: DbStatementResult[] = [];
    try {
      sqlite.transaction(db, () => {
        input.statements.forEach((statement, index) => {
          const label = `sqlite.transaction: statements[${index}]`;
          try {
            results.push(runStatements(sqlite, db, statement.sql, toSqlParams(statement.params, label), label));
          } catch (error) {
            const message = errorText(error);
            throw new Error(message.startsWith(label) ? message : `${label}: ${message}`);
          }
        });
      });
    } catch (error) {
      throw new Error(`${errorText(error)}. The transaction was rolled back.`);
    }
    return { results, changes: results.reduce((sum, result) => sum + result.changes, 0) };
  });
}
