/**
 * The hold of the roots: it ties the use of a path to the check of the path.
 *
 * `inRoot()` reads the links of a path, and the operation reads them again. The hold keeps the
 * links of the roots the same between the two reads, for the calls of one process:
 * - A call that cannot make a link takes a shared hold. Shared holds start together.
 * - A call that can make a link takes the exclusive hold, and starts alone. These calls are
 *   `fs.move`, `fs.copy`, `archive.extract`, and each confined procedure that writes files or
 *   starts a process (`rootHoldOf()` of `confine.ts`).
 * - The calls get the hold in the order that they came. So a series of shared holds does not stop
 *   an exclusive hold for a long time.
 * - A call holds from the check of its paths to the end of its operation. A stream holds until its
 *   handler gives the stream. `fs.watch` opens its watcher in the hold.
 * - A nested call starts in the hold of its caller.
 *
 * One hold covers all roots of the process, because a root can be in another root. The hold covers
 * only the calls of this process.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { rwLock } from "@mark1russell7/collections";

/** The mode of a hold: `shared` for a call that cannot make a link, `exclusive` for a call that can. */
export type RootHoldMode = "shared" | "exclusive";

/** The hold of one call. */
interface Hold {
  readonly mode: RootHoldMode;
  /** This flag is false after the end of the work, so work that the call left behind has no hold. */
  active: boolean;
}

/** The lock of the roots of this process. */
const lock = rwLock();

/** The hold of the current call, through its async work. */
const current = new AsyncLocalStorage<Hold>();

/**
 * This function starts `work` in a hold of the roots, and ends the hold when the work ends, also
 * when it throws. A call in the hold of its caller starts at once: an exclusive hold covers both
 * modes, and a shared hold covers a shared one. A call in a shared hold that asks for the exclusive
 * hold gets an error, because a hold cannot change its mode.
 */
export async function holdRoots<T>(mode: RootHoldMode, work: () => T | PromiseLike<T>): Promise<T> {
  const outer = current.getStore();
  if (outer?.active) {
    if (outer.mode === "shared" && mode === "exclusive") {
      throw new Error("A call in a shared hold of the roots cannot start a call that needs the exclusive hold");
    }
    return await work();
  }
  const release = await lock.acquire(mode);
  const hold: Hold = { mode, active: true };
  try {
    return await current.run(hold, work);
  } finally {
    hold.active = false;
    release();
  }
}
