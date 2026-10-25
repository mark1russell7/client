/**
 * The runners of the steps of a file helper (roadmap O52). A helper is one generator that yields
 * each operation of the file system. `runSync()` and `runAsync()` do the operations, so the sync
 * form and the async form of a helper share all their decisions.
 */

/**
 * The step that gives the result of `op`. The cast is safe because each runner gives the value
 * that the operation of the step gives.
 */
export function* perform<Op, T>(op: Op): Generator<Op, T, unknown> {
  return (yield op) as T;
}

/**
 * This function does the steps with a sync `does`. An error of an operation goes back into the
 * steps, so their `try` and `finally` blocks apply.
 */
export function runSync<Op, T>(steps: Generator<Op, T, unknown>, does: (op: Op) => unknown): T {
  let step = steps.next();
  while (!step.done) {
    let value: unknown;
    try {
      value = does(step.value);
    } catch (error) {
      step = steps.throw(error);
      continue;
    }
    step = steps.next(value);
  }
  return step.value;
}

/** This function does the steps with an async `does`, in the same way as `runSync()`. */
export async function runAsync<Op, T>(steps: Generator<Op, T, unknown>, does: (op: Op) => Promise<unknown>): Promise<T> {
  let step = steps.next();
  while (!step.done) {
    let value: unknown;
    try {
      value = await does(step.value);
    } catch (error) {
      step = steps.throw(error);
      continue;
    }
    step = steps.next(value);
  }
  return step.value;
}
