/**
 * The saved programs of the Composer (roadmap R45).
 *
 * Before, the Composer kept a program only in the URL and in the browser history. Now the reader
 * can save a program under a name, in a program store of `@procedures/store/indexeddb`:
 *
 * - IndexedDB keeps the programs in the browser after the page closes.
 * - When the browser has no IndexedDB, or it refuses to open the database (some private windows),
 *   a store in memory takes its place. Then the programs stay until the page closes.
 * - The store loads only when the reader opens the saved programs, so a page loads no more script.
 */

import type { ProgramStore, StoredProgram } from "@procedures/store/indexeddb";
import type { Json } from "./program";
import { keyToPath, pathToKey } from "@procedures/client/browser";

/** The IndexedDB database of the saved programs. */
export const SAVED_PROGRAMS_DATABASE = "procedures-site-programs";

/** The store of the saved programs. */
export interface SavedPrograms {
  store: ProgramStore;
  /** True when the programs stay after the page closes (IndexedDB). */
  durable: boolean;
}

/** The parts of the store entry that the Composer uses. A test gives its own. */
export type StoreModule = Pick<typeof import("@procedures/store/indexeddb"), "IndexedDbProgramStore" | "MemoryProgramStore" | "hasIndexedDb">;

const loadStoreModule = (): Promise<StoreModule> => import("@procedures/store/indexeddb");

/**
 * This function opens the store of the saved programs: IndexedDB when the browser opens the database, else a
 * store in memory.
 */
export async function openSavedPrograms(load: () => Promise<StoreModule> = loadStoreModule): Promise<SavedPrograms> {
  const { IndexedDbProgramStore, MemoryProgramStore, hasIndexedDb } = await load();
  if (hasIndexedDb()) {
    const store = new IndexedDbProgramStore(SAVED_PROGRAMS_DATABASE);
    try {
      // The first operation opens the database: a refusal of the browser shows here
      await store.list();
      return { store, durable: true };
    } catch {
      await store.close();
    }
  }
  return { store: new MemoryProgramStore(), durable: false };
}

let opened: Promise<SavedPrograms> | undefined;

/** The store of the saved programs of this page. The page opens it one time. */
export function savedPrograms(): Promise<SavedPrograms> {
  opened ??= openSavedPrograms();
  return opened;
}

/** The parts of a name, with a dot between them: `reports.weekly`. */
const NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const MAX_NAME = 100;

/** The problem of a name, or null when the name is good. */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Type a name for the program.";
  if (trimmed.length > MAX_NAME) return `Use a name of ${MAX_NAME} characters or fewer.`;
  if (!NAME.test(trimmed)) return "Use letters, digits, - and _, with a dot between the parts: reports.weekly.";
  return null;
}

/** True when the root of a program is a call: the store keeps only such a program. */
function isCall(program: Json): boolean {
  return typeof program === "object" && program !== null && !Array.isArray(program) && Array.isArray(program["$proc"]);
}

/** The record of a program to save, or the reason why the store does not take it. */
export function toStoredProgram(
  name: string,
  program: Json,
  now: number = Date.now(),
): { ok: true; record: StoredProgram } | { ok: false; reason: string } {
  const problem = nameProblem(name);
  if (problem) return { ok: false, reason: problem };
  if (!isCall(program)) return { ok: false, reason: "The store keeps only a program that starts with a call. Put a procedure at the root first." };
  // The key in its one form: the path of the name, with each segment encoded (roadmap CLI-75)
  const path = keyToPath(name.trim());
  const key = pathToKey(path);
  return { ok: true, record: { key, path, program: program as unknown as StoredProgram["program"], storedAt: now } };
}
