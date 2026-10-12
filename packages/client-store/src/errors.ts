/**
 * The error of a store procedure that cannot do its work.
 *
 * - NOT_CONFIGURED: the caller's registry has no store.
 * - NOT_IMPLEMENTED: the action has no safe implementation (`procedure.remote connect`).
 * - NO_HANDLER: `procedure.register` with `persist` got no handler that the loader allows.
 * - NOT_A_PROGRAM: `procedure.store` got a code procedure. Only a procedure that
 *   `procedure.define` made is a program: code lives in a package.
 */
export class ProcedureStoreError extends Error {
  override readonly name = "ProcedureStoreError";
  readonly code: ProcedureStoreErrorCode;

  constructor(code: ProcedureStoreErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type ProcedureStoreErrorCode = "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "NO_HANDLER" | "NOT_A_PROGRAM";
