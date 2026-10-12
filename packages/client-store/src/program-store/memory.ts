/**
 * A program store in memory: for tests, and for a process that keeps its programs only while it
 * runs. Each read and write copies the record, so a caller that changes a result does not change
 * the store.
 */

import { byKey, checkStoredProgram, keyMatches, type ProgramStore, type StoredProgram } from "./types.js";

export class MemoryProgramStore implements ProgramStore {
  readonly kind = "memory";
  private readonly programs = new Map<string, StoredProgram>();

  async get(key: string): Promise<StoredProgram | undefined> {
    const program = this.programs.get(key);
    return program ? structuredClone(program) : undefined;
  }

  async list(prefix?: string): Promise<StoredProgram[]> {
    return byKey([...this.programs.values()].filter((p) => keyMatches(p.key, prefix)).map((p) => structuredClone(p)));
  }

  async put(program: StoredProgram): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    this.programs.set(checked.key, checked);
  }

  async delete(key: string): Promise<boolean> {
    return this.programs.delete(key);
  }
}
