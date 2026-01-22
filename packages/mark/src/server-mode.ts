/**
 * CLI Server Mode
 *
 * Runs the CLI as a persistent server, exposing all ecosystem procedures
 * via HTTP. Uses server.create procedure internally (dogfooding).
 */

import { print } from "./print.js";
import { loadEcosystemProcedures } from "./ecosystem.js";
import { writeLockfile, removeLockfile, getLockfilePath } from "./lockfile.js";
import type {
  LocalTransport,
  Method,
  Message,
  ProcedureContext,
  ProcedurePath,
  AnyProcedure,
  ProcedureRegistry,
} from "@mark1russell7/client";

export interface ServerModeOptions {
  port: number;
  host?: string;
  transport?: "http" | "websocket" | "both";
  verbose?: boolean;
}

interface ServerCreateResult {
  serverId: string;
  endpoints: Array<{ type: string; address: string }>;
  procedureCount: number;
}

/**
 * Convert procedure path to transport method
 */
function pathToMethod(path: string[]): Method {
  const [service, ...rest] = path;
  return { service: service!, operation: rest.join(".") };
}

/**
 * Register procedure handlers on the transport
 */
function syncRegistryToTransport(
  transport: LocalTransport,
  registry: ProcedureRegistry
): void {
  async function execProcedure<TOutput>(
    path: ProcedurePath,
    input: unknown
  ): Promise<TOutput> {
    const proc = registry.get(path);
    if (!proc || !proc.handler) {
      throw new Error(`Procedure not found: ${path.join(".")}`);
    }
    const ctx = createContext(path);
    return proc.handler(input, ctx) as Promise<TOutput>;
  }

  function createContext(path: ProcedurePath): ProcedureContext {
    return {
      metadata: {},
      path,
      client: {
        call: <TInput, TOutput>(p: ProcedurePath, i: TInput) =>
          execProcedure<TOutput>(p, i),
      },
    };
  }

  for (const procedure of registry.getAll()) {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          ...createContext(procedure.path),
          metadata: message.metadata ?? {},
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  }

  registry.on("register", (procedure: AnyProcedure) => {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          ...createContext(procedure.path),
          metadata: message.metadata ?? {},
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  });
}

/**
 * Build transport configuration array
 */
function buildTransports(options: ServerModeOptions) {
  const transports: Array<{
    type: "http" | "websocket";
    port: number;
    host: string;
    basePath?: string;
    cors?: boolean;
    path?: string;
  }> = [];

  const { port, host = "0.0.0.0", transport = "http" } = options;

  if (transport === "http" || transport === "both") {
    transports.push({
      type: "http",
      port,
      host,
      basePath: "/api",
      cors: true,
    });
  }

  if (transport === "websocket" || transport === "both") {
    transports.push({
      type: "websocket",
      port: transport === "both" ? port + 1 : port,
      host,
      path: "/ws",
    });
  }

  return transports;
}

/**
 * Start CLI in server mode
 */
export async function startServerMode(options: ServerModeOptions): Promise<void> {
  const { port = 3000, verbose = false } = options;

  print.info("Starting CLI server mode...");

  // Load all ecosystem procedures
  if (verbose) {
    print.info("Loading ecosystem procedures...");
  }
  await loadEcosystemProcedures(verbose);

  // Dynamic imports
  const clientModule = await import("@mark1russell7/client");
  const { Client, LocalTransport, PROCEDURE_REGISTRY } = clientModule;

  // Import and register server procedures
  const clientServer = await import("@mark1russell7/client-server");
  clientServer.registerServerProcedures();

  // Create local transport and sync registry
  const transport = new LocalTransport();
  syncRegistryToTransport(transport, PROCEDURE_REGISTRY);
  const client = new Client({ transport });

  // Build transport config
  const transports = buildTransports(options);

  // DOGFOOD: Use server.create procedure
  const result = await client.call<
    { transports: typeof transports; autoRegister: boolean },
    ServerCreateResult
  >(
    { service: "server", operation: "create" },
    {
      transports,
      autoRegister: true,
    }
  );

  // Write lockfile for client discovery
  await writeLockfile({
    pid: process.pid,
    port,
    transport: options.transport ?? "http",
    endpoint: result.endpoints[0]?.address ?? `http://localhost:${port}/api`,
    startedAt: new Date().toISOString(),
  });

  print.success("\nCLI Server running!");
  print.info(`  PID: ${process.pid}`);
  print.info(`  Server ID: ${result.serverId}`);
  print.info(`  Procedures: ${result.procedureCount}`);
  print.info(`  Lockfile: ${getLockfilePath()}`);
  print.info("\nEndpoints:");
  for (const endpoint of result.endpoints) {
    print.info(`  [${endpoint.type}] ${endpoint.address}`);
  }
  print.info("\nPress Ctrl+C to stop.");

  // Handle shutdown
  const cleanup = async () => {
    print.info("\nStopping server...");
    await removeLockfile();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep the process alive
  await new Promise(() => {
    // Never resolves - keeps process running
  });
}

/**
 * Extract port from argv
 */
export function extractPort(argv: string[]): number | null {
  const portIdx = argv.indexOf("--port");
  if (portIdx !== -1) {
    const portValue = argv[portIdx + 1];
    if (portValue !== undefined) {
      const port = parseInt(portValue, 10);
      if (!isNaN(port)) return port;
    }
  }
  return null;
}

/**
 * Extract host from argv
 */
export function extractHost(argv: string[]): string | null {
  const hostIdx = argv.indexOf("--host");
  if (hostIdx !== -1) {
    const hostValue = argv[hostIdx + 1];
    if (hostValue !== undefined) {
      return hostValue;
    }
  }
  return null;
}
