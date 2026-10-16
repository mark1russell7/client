/**
 * The errors of the schedule procedures and of the scheduler.
 */

/** The reason of a `ScheduleError`. */
export type ScheduleErrorCode =
  /** The cron expression is not correct, or it has no time in the next 9 years. */
  | "BAD_CRON"
  /** A schedule of the name exists, and the input does not replace it. */
  | "EXISTS"
  /** No stored program has the key: not in the registry, not in the program store. */
  | "NOT_FOUND"
  /** The key names a procedure of code, not a stored program. */
  | "NOT_A_PROGRAM"
  /** The file of a `FileScheduleStore` is not correct. */
  | "BAD_STORE";

/** An error of the schedules. */
export class ScheduleError extends Error {
  override readonly name = "ScheduleError";
  readonly code: ScheduleErrorCode;

  constructor(code: ScheduleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
