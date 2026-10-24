/**
 * The MCP host: one factory for each MCP server of procedures (CLI-10).
 *
 * Before, each MCP server built the same parts by hand. The parts are the redirect of
 * `console.log`, the tool surface, the read-only narrowing and the host policy. The options of
 * `ProcedureServer` and the `McpServerTransport` are parts too. The dev-tools server (`mark mcp`), `mcp.serve` and the Graph host each had a
 * copy. `createMcpHost()` builds them from one set of options:
 *
 * - The procedures: a registry, modules, or both.
 * - The tools: a surface (namespaces less some keys), a list of keys or patterns, or a function.
 * - `readOnly`: the tools are only the procedures that change nothing, and each call has that
 *   capability.
 * - The host policy (`hostPolicy()` of the core): the call policy (strict by default), the time
 *   limit, the interceptors and the capability. The host does not build the options of
 *   `ProcedureServer` by hand.
 * - The faces: stdio, Streamable HTTP, and SDK transports. The stdio face stops the host when its
 *   input ends. The HTTP face mounts on a listener of the app (`handleHttp`).
 * - The runner (CLI-11): `declare(svc)` gives the host to a service of `@mark1russell7/service`.
 *   Then `run()` starts the host and stops it in stages, and the end of the stdio input is the
 *   trigger `stdin-close` of the runner.
 * - What each tool call gets: the questions to the person (elicitation, with the consents of the
 *   operator), the progress, the envelopes of untrusted text, and the instructions of the server.
 * - The tasks (CLI-35): one store for each face, with a limit of tasks that run at one time. A
 *   procedure with `metadata.taskSupport` runs as a task when the client asks for one.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Transport as SdkTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  PROCEDURE_REGISTRY,
  ProcedureServer,
  capabilityRefusal,
  createRegistry,
  hostPolicy,
  narrowCapability,
  procedureServerOptions,
  registerModules,
  type ElicitationPolicy,
  type HostPolicy,
  type HostPolicyOptions,
  type Interceptor,
  type ProcedureModule,
  type ProcedurePath,
  type ProcedureRegistry,
  type ProcedureServerOptions,
  type Duration,
} from "@procedures/client";
import { proceduresToMcpTools, type McpTool, type McpToolFilter } from "@procedures/mcp";
import { McpServerTransport, distinctTools, namedTools } from "./transport/mcp-transport.js";
import type {
  HttpTransportOptions,
  McpServerTransportOptions,
  McpServerTransportState,
  McpToolContentHook,
  StdioTransportOptions,
} from "./types.js";
import type { UntrustedContentOptions } from "./untrusted.js";
import { taskStoreOf, type McpTaskStore, type McpTasksOptions } from "./tasks.js";

/** The stdio face of a host. */
export interface McpStdioFace extends Omit<StdioTransportOptions, "onEnd"> {
  /** True (the default): the host stops when the input ends. */
  stopOnEnd?: boolean | undefined;
  /** True (the default): `console.log` writes to stderr from `start()` on, so stdout carries only the protocol. */
  redirectConsole?: boolean | undefined;
}

/** The faces of a host. Each face is one `McpServerTransport` on the same server. */
export interface McpHostFaces {
  /** The face over the standard input and output. `true`: `process.stdin` and `process.stdout`. */
  stdio?: boolean | McpStdioFace | undefined;
  /**
   * The face over Streamable HTTP. Without a token of its own, it takes the token of the policy,
   * and without origins of its own, the permitted origins of the policy. The face has no listener
   * (CLI-11): mount `McpHost.handleHttp` on a listener.
   *
   * Deprecated (CLI-2b): `http.token`. Give the token in `policy.token`. From the next MINOR,
   * `http.token` becomes the token of the policy, and the server checks it. A different token in
   * the policy throws an error.
   */
  http?: HttpTransportOptions | undefined;
  /** SDK transports to connect: the in-memory transport of a test, or an embedding. */
  sdk?: SdkTransport | readonly SdkTransport[] | undefined;
}

/** The options of `ProcedureServer` that the host policy does not give. */
export type McpHostServerOptions = Omit<
  ProcedureServerOptions,
  | "registry"
  | "expose"
  | "strictCalls"
  | "interceptors"
  | "capability"
  | "clearanceOrder"
  | "resources"
  | "admitItem"
  | "token"
  | "principalOf"
  | "events"
>;

/** What a function of interceptors gets: the registry and the expose rule of the host. */
export interface McpHostParts {
  readonly registry: ProcedureRegistry;
  readonly expose: ((path: ProcedurePath) => boolean) | undefined;
}

/** The options of `createMcpHost()`. */
export interface McpHostOptions {
  /** The registry of the procedures. Without it: a new registry of `modules`, or the global registry. */
  registry?: ProcedureRegistry | undefined;
  /** Modules of procedures. With `registry`, the host registers them in it. */
  modules?: readonly ProcedureModule[] | undefined;
  /**
   * The tools: a surface (namespaces less some keys), keys and patterns (`git.status`, `git.*`,
   * `*`), or a function of the path. Without it: each procedure of the registry.
   */
  surface?: HostPolicyOptions["expose"];
  /** Keys that are not tools, also when the surface matches them. */
  exclude?: readonly string[] | undefined;
  /**
   * True: the tools are only the procedures that change nothing (`effects.writes` is empty), and
   * each call has that capability (`narrowCapability`).
   */
  readOnly?: boolean | undefined;
  /**
   * More of the host policy: `strictCalls`, `timeout`, `interceptors`, `capability`, `resources`,
   * `token`, `browser`. Strict calls are the safe default of an MCP host: a procedure of code
   * without `metadata.calls` calls only tools. To turn them off, give `strictCalls: false`.
   */
  policy?: Omit<HostPolicyOptions, "expose" | "exclude" | "readOnly"> | undefined;
  /**
   * Interceptors that need the parts of the host: a list, or a function of the registry and the
   * expose rule (the check of a program before it starts). They come after `policy.interceptors`.
   */
  interceptors?: readonly Interceptor[] | ((parts: McpHostParts) => readonly Interceptor[]) | undefined;
  /** The options of `ProcedureServer` that the policy does not give: `autoRegister`, `collections`, `idempotency`. */
  serverOptions?: McpHostServerOptions | undefined;
  /** The name of the server for the MCP client. The default is `"procedure-server"`. */
  name?: string | undefined;
  /** The version of the server for the MCP client. The default is `"1.0.0"`. */
  version?: string | undefined;
  /** The instructions of the server: the MCP client gives them to the model. */
  instructions?: string | undefined;
  /** The faces of the host. The default is `{ stdio: true }`. */
  faces?: McpHostFaces | undefined;
  /** The rules of the questions to the person (CLI-12): `ask`, `operatorConsent`, `timeout`. */
  elicitation?: ElicitationPolicy | undefined;
  /** The envelopes of the output fields with text from outside the host (`metadata.untrusted`). */
  untrusted?: UntrustedContentOptions | undefined;
  /** The content hook: other text blocks for a successful result that is a value. */
  content?: McpToolContentHook | undefined;
  /** The JSON of the default text blocks: `"pretty"` (the default) or `"compact"` on one line. */
  json?: "pretty" | "compact" | undefined;
  /** More filters of the tools: tags, internal procedures. The surface gives the main rule. */
  toolFilter?: Omit<McpToolFilter, "include"> | undefined;
  /** The name of the tool of a procedure, for example `(path) => path.join("_")`. The default is `git.status`. */
  toolName?: ((path: readonly string[]) => string) | undefined;
  /** The limits of a stream that can continue without an end. */
  streamLimits?: { items?: number; time?: Duration } | undefined;
  /** True: debug lines go to stderr. */
  debug?: boolean | undefined;
  /**
   * MCP tasks (CLI-35): a store, or the options of a new store (`maxRunning`, the default 8,
   * `maxStored`, the default 1000, `reserve` and `shareKey` of the fair share, the default 100
   * and the principal else the session, `ttl` and `clock`). Each face shares the store. Without
   * it, the host has no tasks.
   */
  tasks?: McpTasksOptions | undefined;
}

/** The state of a host: if it operates, and the state of each face. */
export interface McpHostState {
  readonly running: boolean;
  readonly faces: readonly McpServerTransportState[];
}

/**
 * A transport part of the runner: the shape of `TransportImpl` of `@mark1russell7/service`. The
 * types are structural, so this package imports no code of the runner.
 */
export interface McpRunnerPart {
  start(signal: AbortSignal, life: unknown): Promise<void> | void;
  stopIntake(): Promise<void> | void;
  drain(deadline: number, signal: AbortSignal): Promise<void> | void;
  inFlight(): number;
  close(): Promise<void> | void;
}

/** A storage of the server as a dependency of the runner: the shape of `DependencyHandle`. */
export type McpRunnerDependency = ReturnType<ProcedureServer["storageHandles"]>[number];

/**
 * What `McpHost.declare()` uses of the builder of a service (`ServiceBuilder` of
 * `@mark1russell7/service`). The types are structural.
 */
export interface McpServiceBuilder {
  server(name: string, knobs: Readonly<Record<string, never>>, impl: McpRunnerPart): unknown;
  dependency(
    name: string,
    spec: { system: null; knobs: Readonly<Record<string, never>>; operations: Readonly<Record<string, { idempotent: boolean }>> },
    handle: McpRunnerDependency,
  ): unknown;
  trigger(trigger: "stdin-close"): unknown;
}

/** An MCP host: its registry, its policy, its server and its faces. */
export interface McpHost {
  readonly registry: ProcedureRegistry;
  readonly policy: HostPolicy;
  readonly server: ProcedureServer;
  /** The expose rule of the host: the procedures that are tools. Undefined: each procedure. */
  readonly expose: ((path: ProcedurePath) => boolean) | undefined;
  /** The MCP transports of the faces, in the order stdio, Streamable HTTP, SDK transports. */
  readonly transports: readonly McpServerTransport[];
  /** The store of the tasks of each face, or undefined when the host has no tasks (CLI-35). */
  readonly tasks: McpTaskStore | undefined;
  /**
   * A promise that resolves when the host stopped: by `stop()`, at the end of the stdio input, or
   * at the close of its part under `run()`.
   */
  readonly closed: Promise<void>;
  /** This function starts each face. A host that `declare()` gave to a service starts under `run()`. */
  start(): Promise<void>;
  /** This function stops the server and each face. The calls in flight get the grace time. */
  stop(options?: { grace?: Duration | undefined }): Promise<void>;
  /**
   * This function declares the host on the builder of a service, for `run()` of
   * `@mark1russell7/service` (CLI-11). The server is a transport part, and each storage is a
   * dependency. A host with a stdio face declares the trigger `stdin-close`. Then the runner owns
   * the stop: the end of the input starts the staged stop, and the stdio face does not stop the
   * host by itself. A host declares one time.
   */
  declare<S extends McpServiceBuilder>(svc: S): S;
  /**
   * This function answers a request of the Streamable HTTP face (`faces.http`) and gives true. It
   * gives false for another path, or without that face. Mount it on a listener, for example an
   * `httpTransport` of `@mark1russell7/service/http`.
   */
  handleHttp(req: IncomingMessage, res: ServerResponse): boolean;
  /** The tools of the host at this time, from the registry and the expose rule. */
  tools(): McpTool[];
  /** The state of the host and of its faces. */
  state(): McpHostState;
}

/**
 * This function sends `console.log` to stderr. Over stdio, stdout carries the protocol: a stray
 * `console.log` of a procedure or a dependency corrupts it. The MCP SDK writes with
 * `process.stdout.write`, so it is not affected. A second call changes nothing.
 */
export function redirectConsoleToStderr(): void {
  const marked = console.log as { mcpRedirected?: boolean };
  if (marked.mcpRedirected) return;
  const log = (...args: unknown[]): void => {
    console.error(...args);
  };
  (log as { mcpRedirected?: boolean }).mcpRedirected = true;
  console.log = log;
}

/** True when the SDK option of the faces is a list of transports. */
function isTransportList(value: SdkTransport | readonly SdkTransport[]): value is readonly SdkTransport[] {
  return Array.isArray(value);
}

/** The operations of a storage as a dependency of the runner: a read can go again, a write cannot. */
const STORAGE_OPERATIONS = Object.freeze({ read: { idempotent: true }, write: { idempotent: false } });

/** The read-only capability of a host: no effect can write. */
const READ_ONLY_REQUEST = { effects: { writes: [] as readonly string[] } };

/**
 * The expose rule of a host: the surface less the excluded keys, and with `readOnly` only the
 * procedures that the read-only capability permits. The rule reads the registry at each call,
 * so a procedure that is registered later gets the same rule.
 */
export function mcpExposeRule(
  registry: ProcedureRegistry,
  options: Pick<McpHostOptions, "surface" | "exclude" | "readOnly">,
): ((path: ProcedurePath) => boolean) | undefined {
  const base = hostPolicy({
    ...(options.surface !== undefined ? { expose: options.surface } : {}),
    ...(options.exclude !== undefined ? { exclude: options.exclude } : {}),
  }).expose;
  if (options.readOnly !== true) return base;
  const capability = narrowCapability(undefined, READ_ONLY_REQUEST);
  return (path) => {
    if (base && !base(path)) return false;
    const procedure = registry.get(path);
    return procedure !== undefined && capabilityRefusal(procedure, capability) === undefined;
  };
}

/**
 * This function builds an MCP host. It starts nothing: `start()` starts the faces. A host
 * stops one time.
 *
 * @example
 * ```typescript
 * const host = createMcpHost({
 *   registry: createRegistry(graphModule),
 *   surface: { namespaces: ["graph"] },
 *   readOnly: process.argv.includes("--read-only"),
 *   name: "graph",
 *   version: "0.1.0",
 * });
 * await host.start();
 * ```
 */
export function createMcpHost(options: McpHostOptions = {}): McpHost {
  const registry = options.registry ?? (options.modules ? createRegistry(...options.modules) : PROCEDURE_REGISTRY);
  if (options.registry && options.modules) registerModules(registry, [...options.modules]);

  const expose = mcpExposeRule(registry, options);
  const parts: McpHostParts = { registry, expose };
  const hostInterceptors = typeof options.interceptors === "function" ? options.interceptors(parts) : (options.interceptors ?? []);
  const interceptors = [...(options.policy?.interceptors ?? []), ...hostInterceptors];
  const policy = hostPolicy({
    strictCalls: true,
    ...options.policy,
    ...(expose ? { expose } : {}),
    ...(options.readOnly === true ? { readOnly: true } : {}),
    ...(interceptors.length > 0 ? { interceptors } : {}),
  });
  const server = new ProcedureServer({ ...procedureServerOptions(policy, registry), ...options.serverOptions });

  // One store of the tasks for each face. The stop of the host closes a store that the host made
  const tasks = taskStoreOf(options.tasks);

  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let stopping: Promise<void> | undefined;
  let running = false;
  // True after declare(): the runner starts and stops the host
  let managed = false;
  // Both stop paths close a task store that the host made: stop(), and the close of the runner part
  const closeTasks = async (): Promise<void> => {
    if (tasks?.owned) await tasks.store.close().catch(() => undefined);
  };
  const stop = (stopOptions: { grace?: Duration | undefined } = {}): Promise<void> => {
    stopping ??= server
      .stop(stopOptions.grace !== undefined ? { grace: stopOptions.grace } : {})
      .finally(async () => {
        await closeTasks();
        running = false;
        resolveClosed();
      });
    return stopping;
  };

  // What each face shares: the tools, the server info and what each call gets
  const toolFilter: McpToolFilter = { ...options.toolFilter, ...(policy.expose ? { include: policy.expose } : {}) };
  const common: McpServerTransportOptions = {
    registry,
    serverInfo: { name: options.name ?? "procedure-server", version: options.version ?? "1.0.0" },
    toolFilter,
    ...(options.toolName ? { toolName: options.toolName } : {}),
    ...(options.instructions !== undefined ? { instructions: options.instructions } : {}),
    ...(options.elicitation ? { elicitation: options.elicitation } : {}),
    ...(options.untrusted ? { untrusted: options.untrusted } : {}),
    ...(options.content ? { content: options.content } : {}),
    ...(options.json ? { json: options.json } : {}),
    ...(options.streamLimits ? { streamLimits: options.streamLimits } : {}),
    ...(options.debug !== undefined ? { debug: options.debug } : {}),
    ...(tasks ? { tasks: { store: tasks.store } } : {}),
  };

  const faces = options.faces ?? { stdio: true };
  const transports: McpServerTransport[] = [];
  const stdio: McpStdioFace | undefined = faces.stdio === true ? {} : faces.stdio === false ? undefined : faces.stdio;
  if (stdio) {
    transports.push(
      new McpServerTransport(server, {
        ...common,
        transport: "stdio",
        stdio: {
          ...(stdio.stdin ? { stdin: stdio.stdin } : {}),
          ...(stdio.stdout ? { stdout: stdio.stdout } : {}),
          // Under run(), the trigger stdin-close of the runner starts the stop
          ...(stdio.stopOnEnd !== false ? { onEnd: () => void (managed ? undefined : stop()) } : {}),
        },
      }),
    );
  }
  let httpFace: McpServerTransport | undefined;
  if (faces.http) {
    // The HTTP face keeps the token and the origins of the policy (CLI-11 moves the checks to the host)
    const policyOrigins = policy.browser.allowedOrigins;
    const allowedOrigins = faces.http.allowedOrigins ?? (Array.isArray(policyOrigins) ? policyOrigins : undefined);
    const allowedHosts = faces.http.allowedHosts ?? policy.browser.allowedHosts;
    const token = faces.http.token ?? policy.token;
    httpFace = new McpServerTransport(server, {
      ...common,
      transport: "http",
      httpOptions: {
        ...faces.http,
        ...(token !== undefined ? { token } : {}),
        ...(allowedOrigins ? { allowedOrigins: [...allowedOrigins] } : {}),
        ...(allowedHosts !== undefined ? { allowedHosts } : {}),
      },
    });
    transports.push(httpFace);
  }
  const sdkTransports: readonly SdkTransport[] = faces.sdk === undefined ? [] : isTransportList(faces.sdk) ? faces.sdk : [faces.sdk];
  for (const sdkTransport of sdkTransports) {
    transports.push(new McpServerTransport(server, { ...common, sdkTransport }));
  }
  for (const transport of transports) server.addTransport(transport);

  /** This function starts the server and its faces: by `start()`, or by the part of the runner. */
  const begin = async (): Promise<void> => {
    if (stopping) throw new Error("This MCP host stopped. A host stops one time: create a new host.");
    if (stdio && stdio.redirectConsole !== false) redirectConsoleToStderr();
    await server.start();
    running = true;
  };

  return {
    registry,
    policy,
    server,
    expose: policy.expose,
    transports,
    tasks: tasks?.store,
    closed,
    async start() {
      if (managed) throw new Error("This MCP host is declared on a service: run() of the service starts it.");
      await begin();
    },
    stop,
    declare(svc) {
      if (managed) throw new Error("This MCP host is declared on a service already. A host declares one time.");
      if (running || stopping) throw new Error("This MCP host started without a service. Declare it before it starts.");
      managed = true;
      // The storages connect before the server starts, and close after it (as the procedures host does)
      for (const handle of server.storageHandles()) {
        svc.dependency(handle.name, { system: null, knobs: {}, operations: STORAGE_OPERATIONS }, handle);
      }
      svc.server("mcp", {}, {
        start: () => begin(),
        stopIntake: () => server.stopIntake(),
        drain: (deadline, signal) => server.drain(deadline, signal),
        inFlight: () => server.inFlight(),
        close: async () => {
          try {
            await server.close();
          } finally {
            await closeTasks();
            running = false;
            resolveClosed();
          }
        },
      });
      if (stdio) svc.trigger("stdin-close");
      return svc;
    },
    handleHttp: (req, res) => httpFace?.handleHttp(req, res) ?? false,
    tools: () => distinctTools(namedTools(proceduresToMcpTools(registry.getAll(), toolFilter), options.toolName)),
    state: () => ({ running, faces: transports.map((transport) => transport.getState()) }),
  };
}
