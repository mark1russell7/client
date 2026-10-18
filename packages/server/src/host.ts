/**
 * The runner entry of the procedures host (CLI-8, decisions D2, D6, D7 and D17).
 *
 * `runProcedureHost(config)` is the only entry that starts `run()` of `@mark1russell7/service` for
 * `procedure-server`, `mark serve` and `mark --server`. It declares the parts of
 * `createProcedureHost()` of `@procedures/peer` in one service. The runner owns the signals, the
 * stop in stages and the exit. Thus the entry installs no signal handler and no hard-exit timer.
 *
 * - The profile: `localDev` for a run in the foreground, where a second Ctrl-C exits at once, and
 *   `daemon` for the background host of `mark`, where a repeat signal has no effect (D6, D7).
 * - The caps of the stages sum to 10 s. They replace the hard-exit timer of 10 s of the entries.
 * - No check gates readiness or liveness, so the host is ready from the end of its startup.
 * - The lockfile is a dependency: its connect writes it before the listeners start, and its close
 *   removes it after the listeners close.
 */

import { daemon, localDev, service, type Lifecycle, type Profile, type RunOptions, type ServiceBuilder } from "@mark1russell7/service";
import { seconds } from "@procedures/client";
import { createProcedureHost, type ProcedureHost, type ProcedureHostOptions } from "@procedures/peer";
import { lockfileHandle, type LockfileData } from "@procedures/peer/lockfile";

/** The mode of a run: in the foreground of a terminal, or as the background host of `mark`. */
export type HostRunMode = "foreground" | "background";

/** The profile of each mode, as data: `localDev` in the foreground, and `daemon` in the background. */
export const HOST_PROFILES: Readonly<Record<HostRunMode, Profile>> = Object.freeze({ foreground: localDev, background: daemon });

/** The configuration of `runProcedureHost()`. */
export interface ProcedureHostRunConfig {
  /** The name of the service of the process. */
  readonly name: string;
  /** The options of the host: the registry, the policy, the faces, the listeners and the collections. */
  readonly host: ProcedureHostOptions;
  readonly mode: HostRunMode;
  /** A profile in place of the profile of the mode. The caller can change a field of it with a spread. */
  readonly profile?: Profile | undefined;
  /** The lockfile of the host, for `mark --server`. */
  readonly lockfile?: LockfileData | undefined;
  /** This function prints the lines of the run, for example at the start of the shutdown. */
  readonly log?: ((line: string) => void) | undefined;
  /** The options of `run()`: a process port and a clock, for a test. The host gets the same clock. */
  readonly run?: RunOptions | undefined;
}

/** A host that runs under `run()`: the host, the service of the process and its lifecycle. */
export interface RunningHost {
  readonly host: ProcedureHost;
  readonly service: ServiceBuilder;
  /** The lifecycle. Its state is `running` after a startup that ended, and `draining` or `exited` after a startup that failed. */
  readonly life: Lifecycle;
}

/**
 * This function declares the service of a procedures host and starts `run()`. It gives the host
 * when the startup ends. After a startup that failed, `life.errors` tells why, and the process
 * exits with the code 1 after the shutdown.
 */
export async function runProcedureHost(config: ProcedureHostRunConfig): Promise<RunningHost> {
  const clock = config.run?.clock;
  const host = createProcedureHost({ ...config.host, ...(clock ? { clock } : {}) });
  const profile = config.profile ?? HOST_PROFILES[config.mode];
  const svc = service(config.name).profile(profile);
  // The profiles of the computer of a developer leave the policies to the service. No check gates them.
  if (!profile.readiness) svc.readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 });
  if (!profile.liveness) svc.liveness({ type: "window", failAfter: seconds(45) });
  if (!profile.startup) svc.startup(seconds(30));
  // A repeat signal: an exit at once in the foreground, no effect in the background (D6)
  svc.onRepeatSignal(profile.onRepeatSignal ?? (config.mode === "foreground" ? "exit" : "ignore"));
  host.declare(svc);
  // The lockfile: after the storages it connects, and before them it closes
  if (config.lockfile) svc.dependency("lockfile", { system: null, knobs: {}, operations: {} }, lockfileHandle(config.lockfile));
  const log = config.log;
  if (log && profile.phases?.some((phase) => phase.name === "stop intake")) svc.onPhase("stop intake", () => log("\nShutting down..."));
  const life = await svc.run(config.run);
  return { host, service: svc, life };
}
