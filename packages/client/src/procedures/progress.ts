/**
 * The progress of a call, from the procedure to the caller (CLI-10).
 *
 * A face of a host (MCP) can show the progress of a long call while it operates. The face puts a
 * `ReportProgress` function on the request when the caller asked for progress, and the procedure
 * gets it as `ctx.progress`. A stream does not need it: a face that collects a stream shows each
 * item as progress. Only the call of the host gets the function, not its nested calls, so the
 * values of one call stay in order.
 */

/** One step of the progress of a call. */
export interface ProgressUpdate {
  /** The work that is done. It must increase with each update of a call. */
  readonly progress: number;
  /** The work of the whole call, when the procedure knows it. */
  readonly total?: number | undefined;
  /** A short text about the step, for example the URL that a crawler fetched. */
  readonly message?: string | undefined;
}

/**
 * The function that tells the caller the progress of the call (`ctx.progress`). It does not
 * reject: a caller that is gone does not stop the call.
 */
export type ReportProgress = (update: ProgressUpdate) => Promise<void>;
