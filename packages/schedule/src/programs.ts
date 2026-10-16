/**
 * The stored programs that a schedule starts, and the settings of the procedures.
 *
 * A schedule names a stored program: a procedure that `procedure.define` made, or a program of
 * the program store of the registry (`@procedures/store`). A procedure of code is not a program:
 * a schedule cannot start `shell.run` directly.
 */

import { isRuntimeDefined, keyToPath, type ProcedureRegistryLike } from "@procedures/client";
import { getProgramStore } from "@procedures/store";
import { ScheduleError } from "./errors.js";
import { defaultScheduleStore, type ScheduleStore } from "./store.js";

/** What the procedures of a module use: the store and the wall clock. */
export interface ScheduleSettings {
  readonly store: ScheduleStore;
  /** The wall time, in milliseconds since 1970. */
  readonly now: () => number;
}

/** The settings of the default module: `defaultScheduleStore` and `Date.now`. */
export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = Object.freeze({ store: defaultScheduleStore, now: () => Date.now() });

/** The form of the key of a program: segments without spaces, joined with dots. */
export const PROGRAM_KEY: RegExp = /^[^.\s]+(\.[^.\s]+)*$/;

/**
 * This function tells where the stored program of a key is: in the registry (a procedure that
 * `procedure.define` made), or only in the program store of the registry. It throws
 * `NOT_A_PROGRAM` for a procedure of code and `NOT_FOUND` for no program.
 */
export async function findProgram(registry: ProcedureRegistryLike, key: string): Promise<"registry" | "store"> {
  const procedure = registry.get(keyToPath(key));
  if (procedure !== undefined) {
    if (!isRuntimeDefined(procedure)) {
      throw new ScheduleError("NOT_A_PROGRAM", `${key} is a procedure of code, not a stored program. A schedule starts only a program of procedure.define or of the program store.`);
    }
    return "registry";
  }
  const programs = getProgramStore(registry);
  if (programs !== undefined && (await programs.get(key)) !== undefined) return "store";
  throw new ScheduleError("NOT_FOUND", `No stored program has the key ${key}: it is not in the registry and not in its program store`);
}
