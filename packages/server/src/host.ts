/**
 * The runner entry of the procedures host (CLI-8, decisions D2, D6, D7 and D17).
 *
 * `runProcedureHost(config)` is the only entry that starts `run()` of `@mark1russell7/service` for
 * `procedure-server`, `mark serve`, `mark --server` and the cold mode of `mark` (CLI-26). It
 * declares the parts of `createProcedureHost()` of `@procedures/peer` in one service. The runner
 * owns the signals, the stop in stages and the exit. Thus the entry installs no signal handler and
 * no hard-exit timer.
 *
 * - The profile: `localDev` for a run in the foreground, where a second Ctrl-C exits at once, and
 *   `daemon` for the background host of `mark`, where a repeat signal has no effect (D6, D7).
 * - The caps of the stages sum to 10 s. They replace the hard-exit timer of 10 s of the entries.
 * - No check gates readiness or liveness, so the host is ready from the end of its startup.
 * - The lockfile is a dependency: its connect writes it before the listeners start, and its close
 *   removes it after the listeners close.
 * - The option `declare` gives the builder of the service to the app before `run()`. The app
 *   declares its own parts and dependencies with the vocabulary of the runner (CLI-62).
 * - The probes of the service answer on each listener of the host under `/_probes`, or on a port
 *   of their own with the option `probes` (CLI-9, decision D5). The service gives both.
 */

import { daemon, localDev, service, type Lifecycle, type Profile, type RunOptions, type ServiceBuilder } from "@mark1russell7/service";
import { probeServer, type ProbeKind } from "@mark1russell7/service/http";
import { hostPolicy, realClock, seconds, type Duration, type HostPolicy, type Interceptor } from "@procedures/client";
import { LOCAL_LISTENER_KNOBS, createProcedureHost, type ProcedureHost, type ProcedureHostOptions } from "@procedures/peer";
import { lockfileHandle, type LockfileData } from "@procedures/peer/lockfile";
import { idleInterceptor, idleTimer, idleTimes, type HostIdle } from "./idle.js";

/** The mode of a run: in the foreground of a terminal, or as the background host of `mark`. */
export type HostRunMode = "foreground" | "background";

/** The profile of each mode, as data: `localDev` in the foreground, and `daemon` in the background. */
export const HOST_PROFILES: Readonly<Record<HostRunMode, Profile>> = Object.freeze({ foreground: localDev, background: daemon });

/**
 * A probe server on a port of its own (CLI-9, decision D5): `probeServer()` of
 * `@mark1russell7/service/http`. It starts first and closes last, thus its probes answer through
 * the whole drain. By default, it also answers `/report`, with the whole verdict of the service.
 * The option `kinds` leaves out a kind, for example the report on a port that is not private.
 */
export interface HostProbeServer {
  /** The port of the probes. 0 gives a free port, and `RunningHost.probes()` gives the real one. */
  readonly port: number;
  /** The address. The default is `127.0.0.1`. */
  readonly host?: string | undefined;
  /** The path before each probe path. The default is none: the port has only the probes. */
  readonly prefix?: string | undefined;
  /** The `Retry-After` of each 503 of a probe. The default is the knob `server_retry_after` of `LOCAL_LISTENER_KNOBS`: 1 s. */
  readonly retryAfter?: Duration | undefined;
  /**
   * The probe kinds that the port answers (SYS-30). The default is all four: `startup`, `readiness`,
   * `liveness` and `report`. The port answers 404 for a kind that is not in the list.
   */
  readonly kinds?: readonly ProbeKind[] | undefined;
}

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
  /**
   * The probe server of the process on a port of its own (CLI-9, decision D5). Without it, each
   * listener of the host answers the probes under `/_probes` (the option `probes` of the host).
   * With it, the listeners do not answer them, unless the option `probes` of the host is given.
   */
  readonly probes?: HostProbeServer | undefined;
  /**
   * This function declares the parts of the app on the service of the process, before `run()`
   * (CLI-62). It gets the builder of the service and the host.
   *
   * - The app uses the methods of the builder: `svc.server()`, `svc.worker()` and `svc.consumer()`
   *   for a transport, `svc.dependency()` with its handle, `svc.check()` and `svc.onPhase()`.
   * - `describe()` shows each part. The runner starts each part with the host, and stops it in
   *   its stage of the shutdown.
   * - The parts of the app come after the parts of the host. Thus the server of the host starts
   *   before a transport of the app, and a listener of the app can mount `host.handler`.
   * - The lockfile comes after the dependencies of the app: it connects last and closes first.
   * - A dependency of the app can gate the calls with the option `controller.requires` of the host.
   *
   * The return value has no effect.
   */
  readonly declare?: ((svc: ServiceBuilder, host: ProcedureHost) => void) | undefined;
  /**
   * The idle stop (CLI-27): the host stops by itself after this time with no call. Without it, the
   * host stops only at a signal or a stop request, as before.
   *
   * - Each call resets the timer at its start and at its end. An open stream or subscription is a
   *   call in flight, and the host does not stop while it is open.
   * - The stop is `life.shutdown()` with the exit code 0. Thus the stop in stages of `run()` applies,
   *   and the lockfile goes at the end.
   */
  readonly idle?: HostIdle | undefined;
}

/** A host that runs under `run()`: the host, the service of the process and its lifecycle. */
export interface RunningHost {
  readonly host: ProcedureHost;
  readonly service: ServiceBuilder;
  /** The lifecycle. Its state is `running` after a startup that ended, and `draining` or `exited` after a startup that failed. */
  readonly life: Lifecycle;
  /**
   * The base URL of each place that answers the probes (CLI-9): the probe server, or each listener
   * of the host, for example `http://127.0.0.1:3000/_probes`. Add `/startup`, `/readiness` or `/liveness`.
   */
  probes(): string[];
}

/**
 * This function declares the service of a procedures host and starts `run()`. It gives the host
 * when the startup ends. After a startup that failed, `life.errors` tells why, and the process
 * exits with the code 1 after the shutdown.
 */
export async function runProcedureHost(config: ProcedureHostRunConfig): Promise<RunningHost> {
  const clock = config.run?.clock;
  // A probe server of its own: the listeners of the host then answer no probes, unless the host options say so (D5)
  const dedicated = config.probes;
  // The idle stop (CLI-27): an interceptor of the policy tells the timer about each call. The timer
  // starts after the startup, and it asks the lifecycle for the stop.
  let life: Lifecycle | undefined;
  const idle = config.idle
    ? idleTimer({
        ...idleTimes(config.idle),
        clock: clock ?? realClock,
        inFlight: () => life?.inFlight() ?? 0,
        stop: (cause) => {
          if (life?.state !== "running") return;
          config.log?.(`\nIdle: ${cause}.`);
          void life.shutdown(cause, { code: 0 });
        },
      })
    : undefined;
  const policy = idle ? withInterceptor(config.host.policy ?? hostPolicy(), idleInterceptor(idle)) : config.host.policy;
  const host = createProcedureHost({
    ...config.host,
    ...(policy ? { policy } : {}),
    ...(clock ? { clock } : {}),
    ...(dedicated && config.host.probes === undefined ? { probes: false } : {}),
  });
  const profile = config.profile ?? HOST_PROFILES[config.mode];
  const svc = service(config.name).profile(profile);
  const probes = dedicated
    ? probeServer({
        port: dedicated.port,
        host: dedicated.host ?? "127.0.0.1",
        ...(dedicated.prefix !== undefined ? { prefix: dedicated.prefix } : {}),
        ...(dedicated.kinds !== undefined ? { kinds: dedicated.kinds } : {}),
        server_retry_after: dedicated.retryAfter ?? LOCAL_LISTENER_KNOBS.server_retry_after,
      })
    : undefined;
  if (probes) svc.healthServer(probes);
  // The profiles of the computer of a developer leave the policies to the service. No check gates them.
  if (!profile.readiness) svc.readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 });
  if (!profile.liveness) svc.liveness({ type: "window", failAfter: seconds(45) });
  if (!profile.startup) svc.startup(seconds(30));
  // A repeat signal: an exit at once in the foreground, no effect in the background (D6)
  svc.onRepeatSignal(profile.onRepeatSignal ?? (config.mode === "foreground" ? "exit" : "ignore"));
  host.declare(svc);
  // The parts of the app (CLI-62): after the parts of the host, so the server of the host has the
  // lifecycle before a transport of the app takes a call
  config.declare?.(svc, host);
  // The lockfile: after the storages and the dependencies of the app it connects, and before them it closes
  if (config.lockfile) svc.dependency("lockfile", { system: null, knobs: {}, operations: {} }, lockfileHandle(config.lockfile));
  const log = config.log;
  if (log && profile.phases?.some((phase) => phase.name === "stop intake")) svc.onPhase("stop intake", () => log("\nShutting down..."));
  life = await svc.run(config.run);
  if (idle) {
    // The timer stops with the lifecycle, also after a stop for another cause
    void life.done.then(() => idle.cancel());
    if (life.state === "running") idle.start();
  }
  const probeBase = (): string[] => {
    const address = probes?.server.address();
    if (typeof address !== "object" || address === null) return [];
    const bound = dedicated?.host ?? "127.0.0.1";
    const shown = bound === "0.0.0.0" || bound === "::" ? "localhost" : bound;
    return [`http://${shown}:${address.port}${dedicated?.prefix ?? ""}`];
  };
  return { host, service: svc, life, probes: () => (probes ? probeBase() : host.info.probes()) };
}

/** This function gives a policy with one more interceptor, after the interceptors of the policy. */
function withInterceptor(policy: HostPolicy, interceptor: Interceptor): HostPolicy {
  return { ...policy, interceptors: [...policy.interceptors, interceptor] };
}
