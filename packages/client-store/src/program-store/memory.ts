/**
 * A program store in memory: for tests, and for a process that keeps its programs only while it
 * runs. Each read and write copies the record, so a caller that changes a result does not change
 * the store. The version of a record is a counter of the store: each put takes the next number.
 * Thus a program that is deleted and written again does not get an old version back.
 */

import {
  byKey,
  checkProgramVersion,
  checkStoredProgram,
  keyMatches,
  type ProgramStore,
  type ProgramWriteOptions,
  type StoredProgram,
} from "./types.js";

export class MemoryProgramStore implements ProgramStore {
  readonly kind = "memory";
  private readonly programs = new Map<string, StoredProgram>();
  /** The last version that a put gave. */
  private counter = 0;

  async get(key: string): Promise<StoredProgram | undefined> {
    const program = this.programs.get(key);
    return program ? structuredClone(program) : undefined;
  }

  async list(prefix?: string): Promise<StoredProgram[]> {
    return byKey([...this.programs.values()].filter((p) => keyMatches(p.key, prefix)).map((p) => structuredClone(p)));
  }

  async put(program: StoredProgram, options?: ProgramWriteOptions): Promise<void> {
    const checked = checkStoredProgram(structuredClone(program));
    // The test and the write are one synchronous step
    checkProgramVersion(checked.key, this.programs.get(checked.key), options);
    this.counter++;
    this.programs.set(checked.key, { ...checked, version: this.counter });
  }

  async delete(key: string, options?: ProgramWriteOptions): Promise<boolean> {
    checkProgramVersion(key, this.programs.get(key), options);
    return this.programs.delete(key);
  }
}
