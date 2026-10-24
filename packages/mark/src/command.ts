/**
 * The service of one `mark` command (CLI-26, decision D17).
 *
 * Each command that runs a procedure starts under `run()` of `@mark1russell7/service`, with the
 * profile `ephemeral`. The runner owns the signals, the stop in stages and the exit. Thus this
 * file installs no signal handler and calls no `process.exit`.
 *
 * - The warm mode: the CLI server (`mark --server`) runs the procedure. The service of the command
 *   has only the command, and the call goes to the server over HTTP.
 * - The cold mode: the procedures host of the CLI server runs in this process, with the same
 *   registry and policy (`markHostOptions()`). It has no listener, no port and no lockfile. The
 *   call goes to the host through its local face (`localFace()` of `@procedures/peer`).
 * - The command is one request of the controller `command`. A first Ctrl-C starts the stop. The
 *   drain aborts the signal of the request at once, and the call gets the abort.
 * - After the command, `end()` asks for the stop with the exit code of the command. The process
 *   port then ends the process with that code.
 */

import { embeddedProcess, ephemeral, nodeProcess, service, type Lifecycle, type Profile, type RequestEnd, type RunOptions, type ServiceBuilder } from "@mark1russell7/service";
import type { Client, ProcedureRegistry } from "@procedures/client";
import type { ProcedureHost, ProcedureHostOptions, TransportConfig } from "@procedures/peer";

/** The name of the service of a command, and of the procedures host of the cold mode. */
export const COMMAND_SERVICE = "mark";

/** The controller of the one request of a command. */
export const COMMAND_CONTROLLER = "command";

/** The route of the one request of a command. A command can have effects, thus it is not idempotent. */
export const COMMAND_ROUTE = "RUN";

/**
 * The profile of each command, in the warm mode and in the cold mode: `ephemeral`. The exit code is
 * 130 after a first Ctrl-C, 143 after SIGTERM and 131 after SIGQUIT. A second signal during the
 * stop ends the process at once with 1.
 *
 * Before CLI-26, a cold command gave 1 after a first Ctrl-C and 130 after a second one. A signal
 * ended a warm command at once, and the server continued the call.
 */
export const COMMAND_PROFILE: Profile = ephemeral;

/** This function declares the controller and the route of the one request of a command. */
export function declareCommand(svc: ServiceBuilder): ServiceBuilder {
  svc.controller(COMMAND_CONTROLLER).route(COMMAND_ROUTE, { idempotent: false });
  return svc;
}

/** Where a command runs: the options of `run()`, and if the run owns its process. */
export interface CommandProcess {
  /** The options of `run()`: the process port and the clock. A port here wins over `ownsProcess`. */
  readonly run?: RunOptions | undefined;
  /** True when the run owns its process, as the bin of `mark` does. */
  readonly ownsProcess?: boolean | undefined;
}

/**
 * This function gives the options of `run()` for one command. A run that owns its process gets
 * `nodeProcess`: the runner owns the signals, and it ends the process. Each other run gets a new
 * `embeddedProcess()`: no signal handler, and no end of the process.
 */
export function commandRunOptions(given: CommandProcess = {}): RunOptions {
  if (given.run?.process !== undefined) return given.run;
  return { ...given.run, process: given.ownsProcess === true ? nodeProcess : embeddedProcess() };
}

/** A command that runs under `run()`. */
export interface CommandRun {
  /** The lifecycle of the service of the command. */
  readonly life: Lifecycle;
  /**
   * This method does the work of the command as the one request of the service. The signal of
   * the work aborts at the start of the drain. The method gives the end of the request: `done`,
   * `failed`, `refused` (the stop started before the work) or `cut` (the stop aborted the work).
   */
  request(work: (signal: AbortSignal) => Promise<void>): Promise<RequestEnd>;
  /**
   * This method asks for the stop with the exit code of the command, and gives the exit code of
   * the lifecycle. A signal that started the stop first keeps its exit code. With the process of
   * Node, the process ends, and the promise does not resolve.
   */
  end(code: number): Promise<number>;
}

/** This function gives the command of a lifecycle that `declareCommand()` declared. */
export function commandOf(life: Lifecycle): CommandRun {
  return {
    life,
    async request(work) {
      const stream = life.request<true>(COMMAND_CONTROLLER, COMMAND_ROUTE, async (signal) => {
        await work(signal);
        return true as const;
      });
      return (await stream.collect()).end;
    },
    async end(code) {
      await life.shutdown("the command ended", { code });
      return life.done;
    },
  };
}

/** This function starts the service of a command on the CLI server (the warm mode). */
export async function startWarmCommand(where: CommandProcess = {}): Promise<CommandRun> {
  const svc = declareCommand(service(COMMAND_SERVICE).profile(COMMAND_PROFILE));
  return commandOf(await svc.run(commandRunOptions(where)));
}

/** The options of `markHostOptions()`. */
export interface MarkHostConfig {
  /** The id of the host: `host.info` gives it as `peerId`. */
  readonly id: string;
  /** The registry of `mark` (`loadEcosystemRegistry()`). */
  readonly registry: ProcedureRegistry;
  /** The transports of the CLI server. The cold mode gives only the transport `local`. */
  readonly transports: readonly TransportConfig[];
  /** The token of the CLI server. The cold mode has none: each call of the local face is a call of this process. */
  readonly token?: string | undefined;
  /** The topic patterns of the remote events (`--events`). The default is none. */
  readonly events?: readonly string[] | undefined;
}

/**
 * This function gives the options of the procedures host of `mark`, for the CLI server and for the
 * cold mode. Thus the two hosts serve the same procedures, with the same policy: `hostPolicy()` of
 * the core, no expose list, and `events.subscribe` with the topics of `--events`.
 */
export async function markHostOptions(config: MarkHostConfig): Promise<ProcedureHostOptions> {
  const { hostPolicy } = await import("@procedures/client");
  const { peerHostOptions } = await import("@procedures/peer");
  const policy = hostPolicy({ ...(config.token !== undefined ? { token: config.token } : {}), events: { topics: [...(config.events ?? [])] } });
  return peerHostOptions({ id: config.id, transports: [...config.transports], registry: config.registry, policy }, "procedures");
}

/** A command in this process: its service, the procedures host and a client of the host. */
export interface ColdCommand {
  readonly command: CommandRun;
  readonly host: ProcedureHost;
  /**
   * A client of the host. `stream()` and `call()` go through the local face of the host. `exec()`
   * runs a procedure reference with the registry of the host, as before (its nested refs need the rules of the registry).
   */
  readonly client: Client;
}

/**
 * The startup of a cold command that failed. The lifecycle stops the parts that started, and then
 * it exits with the code 1: `life.done` gives the code. With the process of Node, the process ends.
 */
export interface ColdStartFailure {
  readonly errors: readonly string[];
  readonly life: Lifecycle;
}

/**
 * This function starts a command in this process (the cold mode): the procedures host of the CLI
 * server, under `runProcedureHost()` with `COMMAND_PROFILE`. After a startup that failed, it
 * gives the errors and the lifecycle.
 */
export async function startColdCommand(registry: ProcedureRegistry, where: CommandProcess = {}): Promise<ColdCommand | ColdStartFailure> {
  const { Client } = await import("@procedures/client");
  const { localFace } = await import("@procedures/peer");
  const { runProcedureHost } = await import("@procedures/server");
  const local = localFace();
  const id = `cold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const options = await markHostOptions({ id, registry, transports: [{ type: "local" }] });
  const running = await runProcedureHost({
    name: COMMAND_SERVICE,
    mode: "foreground",
    profile: COMMAND_PROFILE,
    host: { ...options, faces: { local: local.face } },
    declare: (svc) => {
      declareCommand(svc);
    },
    run: commandRunOptions(where),
  });
  if (running.life.state !== "running") {
    return { errors: [...running.life.errors], life: running.life };
  }
  const client = new Client({ transport: local.transport }).useRegistry(registry);
  return { command: commandOf(running.life), host: running.host, client };
}
