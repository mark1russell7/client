/**
 * A procedures host outside a service (CLI-7).
 *
 * A process under `run()` declares the parts of its host, and the lifecycle starts and stops them.
 * A host that a procedure starts while its process runs (`server.create`), or a host of a test,
 * has no service of its own. `runOutsideService()` then starts the parts, and its `stop()` calls
 * them in the sequence of the stages: the stop of the intake, the drain for the grace, the close
 * of the transports and the close of the dependencies. It is the convenience of
 * `ProcedureServer.stop()` for a whole host. It owns no signal and does not end the process.
 */

import type { Health, Lifecycle } from "@mark1russell7/service";
import { optionalMs, type Clock, type Duration } from "@procedures/client";
import { OUTSIDE_SERVICE, type HostPart, type ProcedureHost } from "./index.js";

/** The run of a host outside a service. */
export interface OutsideRun {
  /** This method connects the dependencies and starts each part. A failure stops the parts that started. */
  start(): Promise<void>;
  /** This method stops the parts in the sequence of the stages. The calls in flight get the grace. */
  stop(options?: { grace?: Duration | undefined }): Promise<void>;
}

/**
 * The lifecycle that the parts get outside a service. It has no health and no request tracking,
 * thus the calls of the faces go to the server directly.
 */
function outsideLifecycle(): Lifecycle {
  const none = (): never => {
    throw new Error("This procedures host runs outside a service: it has no health and no request tracking");
  };
  const health: Health = { verdict: none, probe: none, subscribe: none, forceFail: none, drain: none, stop: none };
  const life: Lifecycle = {
    health,
    state: "running",
    exitCode: null,
    errors: [],
    started: Promise.resolve(),
    done: new Promise<number>(() => undefined),
    signal: new AbortController().signal,
    shutdown: none,
    request: none,
    inFlight: () => 0,
    keepAlive: () => true,
  };
  return Object.assign(life, { [OUTSIDE_SERVICE]: true });
}

/** This function runs each close, and throws the first error after the last close. */
async function closeEach(closes: ReadonlyArray<() => Promise<void> | void>): Promise<void> {
  let failure: { error: unknown } | undefined;
  for (const close of closes) {
    try {
      await close();
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
}

/** This function runs a host outside a service: `start()` starts its parts, and `stop()` stops them. */
export function runOutsideService(host: ProcedureHost, clock: Clock): OutsideRun {
  const life = outsideLifecycle();
  let started: HostPart[] = [];
  let connected = false;

  // The intake stops first: the listener of an HTTP transport closes at its stop of the intake.
  // A second stop of the intake has no effect.
  const closeAll = async (parts: readonly HostPart[]): Promise<void> => {
    const dependencies = connected ? [...host.dependencies].reverse() : [];
    connected = false;
    const reversed = [...parts].reverse();
    await closeEach([
      ...reversed.map((part) => () => part.impl.stopIntake()),
      ...reversed.map((part) => () => part.impl.close()),
      ...dependencies.map((dependency) => () => dependency.handle.close()),
    ]);
  };

  return {
    async start(): Promise<void> {
      const signal = new AbortController().signal;
      try {
        for (const dependency of host.dependencies) await dependency.handle.connect(signal);
        connected = true;
        for (const part of host.parts) {
          await part.impl.start(signal, life);
          started.push(part);
        }
      } catch (error) {
        // A failed start leaves no port open
        const parts = started;
        started = [];
        await closeAll(parts).catch(() => undefined);
        throw error;
      }
    },
    async stop(options = {}): Promise<void> {
      const graceMs = optionalMs(options.grace, "grace") ?? 0;
      const parts = started;
      started = [];
      for (const part of parts) await part.impl.stopIntake();
      // The calls in flight have the grace. At its end, the close aborts the calls that still run.
      const deadline = clock.now() + graceMs;
      const signal = new AbortController().signal;
      await Promise.all(parts.map((part) => part.impl.drain(deadline, signal)));
      await closeAll(parts);
    },
  };
}
