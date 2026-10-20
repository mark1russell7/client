/**
 * The procedure server of the `server` CLI and of `mark serve` (roadmap 2.3, 3.1).
 *
 * The server builds a registry of its own from the modules of its `--procedures` packages (the
 * side-effect-free `<package>/module` entry), with the `server.*` procedures, and serves it under
 * the host policy of the core (`hostPolicy()`): the token, the `--expose` list and the browser
 * checks. A package without a module entry still works: the server imports it and takes the
 * procedures that the import added to the global registry.
 *
 * The server always serves `events.subscribe` (`documentation/EVENTS.md`). Its topic rule is the
 * `--events` patterns, and no topic without them. `--fs-root` confines each procedure to a root
 * (`confineToRoot()` of `@procedures/fs`).
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PROCEDURE_REGISTRY,
  createRegistry,
  hostPolicy,
  pathToKey,
  type AnyProcedure,
  type HostPolicy,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import type { RunOptions } from "@mark1russell7/service";
import { createPeer, peerHostOptions, type Peer, type PeerEndpoint } from "@procedures/peer";
import peerModule from "@procedures/peer/module";
import { parseConfig } from "./config.js";
import { runProcedureHost } from "./host.js";
import { serverModule } from "./module.js";
import type { ServerConfig } from "./types.js";

/** A package name and the subpath after it: "@a/b/register" gives ["@a/b", "./register"]. */
function splitSpec(spec: string): { name: string; subpath: string } {
  const parts = spec.split("/");
  const count = spec.startsWith("@") ? 2 : 1;
  const name = parts.slice(0, count).join("/");
  const rest = parts.slice(count).join("/");
  return { name, subpath: rest ? `./${rest}` : "." };
}

/**
 * The file of an export of a package (`subpath`: "." or "./module"), from the `node_modules`
 * folders above `from`. Undefined when no folder has the package or the export.
 */
function resolveExport(name: string, subpath: string, from: string): string | undefined {
  let dir = resolve(from);
  for (;;) {
    const folder = join(dir, "node_modules", ...name.split("/"));
    const manifestPath = join(folder, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: Record<string, unknown>; main?: string };
      const entry = manifest.exports?.[subpath] ?? manifest.exports?.[`${subpath}.js`];
      const target =
        typeof entry === "string"
          ? entry
          : ((entry as { import?: string; default?: string } | undefined)?.import ?? (entry as { default?: string } | undefined)?.default);
      if (target) return join(folder, target);
      if (subpath === "." && manifest.main) return join(folder, manifest.main);
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** The URL to import for a package export, from the first folder that has it; else the bare specifier. */
function importTarget(name: string, subpath: string, folders: readonly string[]): string | undefined {
  for (const from of folders) {
    const file = resolveExport(name, subpath, from);
    if (file && existsSync(file)) return pathToFileURL(file).href;
  }
  return undefined;
}

/**
 * The module of a procedure package: its `module` entry, or else the procedures that importing
 * the package adds to the global registry. A package resolves from the folders of `resolveFrom`
 * (the current folder by default), then from this package. "pkg/register" (the form of the old
 * examples) gives the module of "pkg". A file URL or a path is imported as it is.
 */
export async function loadProcedureModule(spec: string, resolveFrom: readonly string[] = [process.cwd()]): Promise<ProcedureModule> {
  const isFile = spec.startsWith("file:") || spec.startsWith(".") || isAbsolute(spec);
  if (!isFile) {
    const { name, subpath } = splitSpec(spec);
    const moduleUrl = importTarget(name, "./module", resolveFrom);
    try {
      const exports = (await import(moduleUrl ?? `${name}/module`)) as { default?: ProcedureModule };
      if (exports.default && Array.isArray(exports.default.procedures)) return exports.default;
    } catch {
      // No module entry: the package registers on import
    }
    return importedModule(spec, importTarget(name, subpath, resolveFrom) ?? spec);
  }
  return importedModule(spec, spec.startsWith("file:") ? spec : pathToFileURL(resolve(spec)).href);
}

/** The procedures that importing `target` adds to the global registry, as a module. */
async function importedModule(name: string, target: string): Promise<ProcedureModule> {
  const before = new Set(PROCEDURE_REGISTRY.getAll().map((procedure) => pathToKey(procedure.path)));
  await import(target);
  const added: AnyProcedure[] = PROCEDURE_REGISTRY.getAll().filter((procedure) => !before.has(pathToKey(procedure.path)));
  return { name, procedures: added };
}

/** What `confineToRoot()` of `@procedures/fs` gives. */
interface Confined {
  root: string;
  fs: string[];
  confined: string[];
  refused: string[];
}

/** The function of `@procedures/fs` that confines each procedure of a registry to a root. */
type ConfineToRoot = (registry: ProcedureRegistry, root: string) => Confined;

/**
 * This function confines each procedure of the registry to the root of `--fs-root`, with
 * `confineToRoot()` of `@procedures/fs` (roadmap R33): each procedure keeps its paths in the root,
 * or the root refuses it. The package resolves from the folders of `resolveFrom`, then from this
 * package. Without it, the server does not start.
 */
async function confineRoot(registry: ProcedureRegistry, root: string, resolveFrom: readonly string[]): Promise<Confined> {
  const target = importTarget("@procedures/fs", "./module", resolveFrom) ?? "@procedures/fs/module";
  let confine: ConfineToRoot | undefined;
  try {
    confine = ((await import(target)) as { confineToRoot?: ConfineToRoot }).confineToRoot;
  } catch (error) {
    throw new Error(`--fs-root needs the package @procedures/fs: ${error instanceof Error ? error.message : String(error)}`);
  }
  // An older @procedures/fs confines only fs.*: the server does not start with it
  if (typeof confine !== "function") throw new Error("--fs-root needs a version of @procedures/fs with confineToRoot");
  return confine(registry, root);
}

/** The server that `runServer()` started. */
export interface RunningServer {
  peer: Peer;
  registry: ProcedureRegistry;
  policy: HostPolicy;
  endpoints: PeerEndpoint[];
  token: string | undefined;
  /** True when the token is random, for this run */
  generatedToken: boolean;
  /** The absolute path of the root of the files (`--fs-root`), or undefined. */
  fsRoot?: string | undefined;
  /** With a root: the keys of the procedures that the root refuses. */
  refusedUnderRoot?: string[] | undefined;
}

/**
 * The token of a configuration: `--token`, else `SERVER_TOKEN`, else a random one of 32 bytes, the
 * size of the token of `mark --server` (CLI-8). `--no-token`: none.
 */
function tokenOf(config: ServerConfig): { token: string | undefined; generated: boolean } {
  const envToken = process.env["SERVER_TOKEN"] || undefined;
  if (config.token === null) return { token: undefined, generated: false };
  if (config.token !== undefined) return { token: config.token, generated: false };
  if (envToken !== undefined) return { token: envToken, generated: false };
  return { token: randomBytes(32).toString("hex"), generated: true };
}

/** The options of `startServer()` and `runServer()`. */
export interface ServerRunOptions {
  /** The folders that a `--procedures` package resolves from, first to last (default: the current folder). */
  resolveFrom?: readonly string[] | undefined;
  /** The options of `run()` of `runServer()`: a process port and a clock, for a test (CLI-8). */
  run?: RunOptions | undefined;
}

/** What the server of a configuration serves: its registry, its policy, its token and its root. */
interface PreparedServer {
  registry: ProcedureRegistry;
  policy: HostPolicy;
  token: string | undefined;
  generated: boolean;
  confined: Confined | undefined;
}

/** A new peer id. */
function newPeerId(): string {
  return `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** This function builds the registry and the host policy of a configuration. */
async function prepareServer(config: ServerConfig, log: (line: string) => void, options: ServerRunOptions): Promise<PreparedServer> {
  // The server.* procedures: those of the peer package (server.create, server.call and the
  // others), and server.start, server.stop and server.status of this package
  const modules: ProcedureModule[] = [peerModule, serverModule];
  for (const spec of config.procedures) {
    if (config.verbose) log(`  Loading: ${spec}`);
    try {
      modules.push(await loadProcedureModule(spec, options.resolveFrom ?? [process.cwd()]));
    } catch (error) {
      throw new Error(`Failed to load procedure package ${spec}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const registry = createRegistry(...modules);
  if (config.verbose) log(`  Registered procedures: ${registry.getAll().length}`);

  // --fs-root: each procedure of the registry keeps its paths in the root, also for a nested
  // call, or the root refuses it
  const confined = config.fsRoot === undefined ? undefined : await confineRoot(registry, config.fsRoot, options.resolveFrom ?? [process.cwd()]);
  if (confined && config.verbose) {
    log(`  Confined to ${confined.root}: ${confined.fs.length} fs procedures, ${confined.confined.length} other procedures, ${confined.refused.length} refused`);
  }

  // A token by default: the server serves every procedure it loads, and any local program
  // could call it. `--no-token` turns this off on purpose.
  const { token, generated } = tokenOf(config);
  const policy = hostPolicy({
    ...(config.expose.length > 0 ? { expose: config.expose } : {}),
    ...(token !== undefined ? { token } : {}),
    // The remote events (EVENTS.md): the server always pins events.subscribe. Without --events,
    // the topic rule is empty, so each subscription gets TOPIC_NOT_FOUND. The bus is the global
    // bus, which is also the ctx.bus of the procedures.
    events: { topics: config.events ?? [] },
  });
  return { registry, policy, token, generated, confined };
}

/**
 * This function starts the server of a configuration outside a service, as a peer. It returns when
 * the transports listen. `peer.stop()` stops it. The `server` CLI uses `runServer()` instead.
 */
export async function startServer(
  config: ServerConfig,
  log: (line: string) => void = console.log,
  options: ServerRunOptions = {}
): Promise<RunningServer> {
  const { registry, policy, token, generated, confined } = await prepareServer(config, log, options);
  const peer = await createPeer({ id: newPeerId(), transports: config.transports, registry, policy });
  await peer.start();
  return {
    peer,
    registry,
    policy,
    endpoints: peer.getEndpoints(),
    token,
    generatedToken: generated,
    ...(confined ? { fsRoot: confined.root, refusedUnderRoot: confined.refused } : {}),
  };
}

/** The address of the probe server of `--probe-port`: the address of the first network transport, as `--host` gives it. */
function probeHostOf(config: ServerConfig): string {
  return config.transports.find((transport) => transport.type !== "local")?.host ?? "127.0.0.1";
}

/**
 * The `server` CLI: parse the options, start the server under `run()` of `@mark1russell7/service`,
 * and print where it listens. `mark serve` calls it with its own arguments. The runner owns the
 * signals, the stop in stages and the exit: this function installs no signal handler and no
 * hard-exit timer (CLI-8). Its promise ends when the lifecycle ends.
 */
export async function runServer(argv: string[], options: ServerRunOptions = {}): Promise<void> {
  const config = parseConfig(argv);
  console.log("Starting procedure server...");
  if (config.verbose) {
    console.log("  Procedures:", config.procedures.join(", ") || "(none specified)");
    console.log("  Transports:", config.transports.map((t) => t.type).join(", "));
  }

  const { registry, policy, token, generated, confined } = await prepareServer(config, console.log, options);
  const { host, life, probes } = await runProcedureHost({
    name: "procedure-server",
    mode: "foreground",
    host: peerHostOptions({ id: newPeerId(), transports: config.transports, registry, policy }, "procedures"),
    log: console.log,
    // --probe-port: the probes answer on a port of their own, on the address of --host (CLI-9, D5)
    ...(config.probePort !== undefined ? { probes: { port: config.probePort, host: probeHostOf(config) } } : {}),
    ...(options.run ? { run: options.run } : {}),
  });
  if (life.state !== "running") {
    // The startup failed: the lifecycle stops the parts that started, and the process exits with 1
    console.error("Server failed to start:");
    for (const error of life.errors) console.error(`  ${error}`);
    await life.done;
    return;
  }

  console.log("\nServer started!");
  console.log(`  Server ID: ${host.id}`);
  console.log(`  Procedures: ${host.server.procedureCount}`);
  console.log("\nEndpoints:");
  for (const endpoint of host.info.endpoints()) {
    console.log(`  [${endpoint.type}] ${endpoint.address}`);
  }
  for (const base of probes()) {
    console.log(`  [probes] ${base}/startup, ${base}/readiness, ${base}/liveness (no token)`);
  }
  if (token === undefined) {
    console.log("\nNo token: any program on this computer can call the server.");
  } else {
    console.log(`\nToken${generated ? " (random, for this run)" : ""}: ${token}`);
    console.log("  Send it as 'Authorization: Bearer <token>', or as ?token=<token> for WebSocket.");
  }
  if (config.expose.length > 0) {
    console.log(`Serves only: ${config.expose.join(", ")}`);
  }
  const events = config.events ?? [];
  console.log(events.length > 0 ? `Event topics (events.subscribe): ${events.join(", ")}` : "Event topics: none (--events adds them)");
  if (confined !== undefined) {
    console.log(`File root: ${confined.root} (each procedure refuses a path outside it)`);
    console.log(`  Refused under the root: ${confined.refused.length} procedures that the root cannot confine`);
  }
  console.log("\nPress Ctrl+C to stop the server.");
  // A signal starts the stop in stages: the stop of the intake, the drain, the close of the
  // listeners and of the storages. A second Ctrl-C exits at once (the profile localDev, D6).
  await life.done;
}
