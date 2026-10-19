/**
 * The signal hooks of `tree-kill.ts`. A host under `run()` of `@mark1russell7/service` owns its
 * signals: the drain aborts each call, and the abort kills the tree of the call. So a signal
 * with another handler kills no tree. Before, the first SIGTERM killed each tree before the drain,
 * and a stream of `shell.stream` ended with `done`, not in band (CI-2 found it).
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { OWN_PROCESS_GROUP, killTree, onSignal, track } from "./tree-kill.js";

let children: ChildProcess[] = [];
let handlers: Array<() => void> = [];
afterEach(async () => {
  // Each child ends before the next test, so its hooks are gone
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const ended = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    killTree(child, "SIGKILL");
    await ended;
  }
  children = [];
  for (const remove of handlers) remove();
  handlers = [];
});

/** This function starts a child that runs until a test kills it, and records it. */
function sleeper(): ChildProcess {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: OWN_PROCESS_GROUP, stdio: "ignore" });
  children.push(child);
  track(child);
  return child;
}

/** This function adds a handler of a signal, as the runner of a service does. */
function ownSignal(signal: NodeJS.Signals): void {
  const handler = (): void => undefined;
  process.on(signal, handler);
  handlers.push(() => process.off(signal, handler));
}

describe("the signal hooks of tree-kill", () => {
  it("kill no tree when another handler owns the signal", async () => {
    const child = sleeper();
    await new Promise<void>((resolve) => child.once("spawn", () => resolve()));
    ownSignal("SIGTERM");
    // The hook of tree-kill and the handler of the "runner": the hook leaves the stop to the runner
    expect(process.listenerCount("SIGTERM")).toBeGreaterThan(1);
    onSignal("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
  });

  it("keep the hooks while a tracked child runs, and remove them when it ends", async () => {
    const before = process.listenerCount("SIGTERM");
    const child = sleeper();
    await new Promise<void>((resolve) => child.once("spawn", () => resolve()));
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    const ended = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    killTree(child, "SIGKILL");
    await ended;
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});
