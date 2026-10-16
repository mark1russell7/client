/**
 * db.transaction procedure (roadmap R44)
 *
 * The statements of the input run in order in one transaction. When one fails, the procedure
 * rolls back the transaction and does not save the file: the database stays as it was. A
 * statement that gives rows (SELECT, or RETURNING) gives them in its result, so a later
 * statement can follow an earlier one in the same transaction.
 */

import { withConnection } from "@mark1russell7/docker-sqlite";
import type { DbStatementResult, DbTransactionInput, DbTransactionOutput } from "../../types.js";
import { databasePath, runStatements } from "./shared.js";

/**
 * Run statements in one transaction
 */
export async function dbTransaction(input: DbTransactionInput): Promise<DbTransactionOutput> {
  return withConnection({ dbPath: databasePath(input.dbPath) }, (db) => {
    db.run("BEGIN");
    const results: DbStatementResult[] = [];
    try {
      input.statements.forEach((statement, index) => {
        const label = `db.transaction: statements[${index}]`;
        try {
          results.push(runStatements(db, statement.sql, statement.params ?? [], label));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(message.startsWith(label) ? message : `${label}: ${message}`);
        }
      });
      db.run("COMMIT");
    } catch (error) {
      try {
        db.run("ROLLBACK");
      } catch {
        // SQLite ended the transaction already (an ON CONFLICT ROLLBACK)
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}. The transaction was rolled back.`);
    }
    return { results, changes: results.reduce((sum, result) => sum + result.changes, 0) };
  });
}
