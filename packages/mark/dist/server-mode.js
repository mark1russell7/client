"use strict";
/**
 * CLI Server Mode
 *
 * Runs the CLI as a persistent server, exposing all ecosystem procedures
 * via HTTP. Uses server.create procedure internally (dogfooding).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServerMode = startServerMode;
exports.extractPort = extractPort;
exports.extractHost = extractHost;
const gluegun_1 = require("gluegun");
const ecosystem_1 = require("./ecosystem");
const lockfile_1 = require("./lockfile");
/**
 * Convert procedure path to transport method
 */
function pathToMethod(path) {
    const [service, ...rest] = path;
    return { service: service, operation: rest.join(".") };
}
/**
 * Register procedure handlers on the transport
 */
function syncRegistryToTransport(transport, registry) {
    async function execProcedure(path, input) {
        const proc = registry.get(path);
        if (!proc || !proc.handler) {
            throw new Error(`Procedure not found: ${path.join(".")}`);
        }
        const ctx = createContext(path);
        return proc.handler(input, ctx);
    }
    function createContext(path) {
        return {
            metadata: {},
            path,
            client: {
                call: (p, i) => execProcedure(p, i),
            },
        };
    }
    for (const procedure of registry.getAll()) {
        if (procedure.handler) {
            const method = pathToMethod(procedure.path);
            transport.register(method, async (payload, message) => {
                const context = {
                    ...createContext(procedure.path),
                    metadata: message.metadata ?? {},
                    ...(message.signal ? { signal: message.signal } : {}),
                };
                return procedure.handler(payload, context);
            });
        }
    }
    registry.on("register", (procedure) => {
        if (procedure.handler) {
            const method = pathToMethod(procedure.path);
            transport.register(method, async (payload, message) => {
                const context = {
                    ...createContext(procedure.path),
                    metadata: message.metadata ?? {},
                    ...(message.signal ? { signal: message.signal } : {}),
                };
                return procedure.handler(payload, context);
            });
        }
    });
}
/**
 * Build transport configuration array
 */
function buildTransports(options) {
    const transports = [];
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
async function startServerMode(options) {
    const { port = 3000, verbose = false } = options;
    gluegun_1.print.info("Starting CLI server mode...");
    // Load all ecosystem procedures
    if (verbose) {
        gluegun_1.print.info("Loading ecosystem procedures...");
    }
    await (0, ecosystem_1.loadEcosystemProcedures)(verbose);
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
    const result = await client.call({ service: "server", operation: "create" }, {
        transports,
        autoRegister: true,
    });
    // Write lockfile for client discovery
    await (0, lockfile_1.writeLockfile)({
        pid: process.pid,
        port,
        transport: options.transport ?? "http",
        endpoint: result.endpoints[0]?.address ?? `http://localhost:${port}/api`,
        startedAt: new Date().toISOString(),
    });
    gluegun_1.print.success("\nCLI Server running!");
    gluegun_1.print.info(`  PID: ${process.pid}`);
    gluegun_1.print.info(`  Server ID: ${result.serverId}`);
    gluegun_1.print.info(`  Procedures: ${result.procedureCount}`);
    gluegun_1.print.info(`  Lockfile: ${(0, lockfile_1.getLockfilePath)()}`);
    gluegun_1.print.info("\nEndpoints:");
    for (const endpoint of result.endpoints) {
        gluegun_1.print.info(`  [${endpoint.type}] ${endpoint.address}`);
    }
    gluegun_1.print.info("\nPress Ctrl+C to stop.");
    // Handle shutdown
    const cleanup = async () => {
        gluegun_1.print.info("\nStopping server...");
        await (0, lockfile_1.removeLockfile)();
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
function extractPort(argv) {
    const portIdx = argv.indexOf("--port");
    if (portIdx !== -1) {
        const portValue = argv[portIdx + 1];
        if (portValue !== undefined) {
            const port = parseInt(portValue, 10);
            if (!isNaN(port))
                return port;
        }
    }
    return null;
}
/**
 * Extract host from argv
 */
function extractHost(argv) {
    const hostIdx = argv.indexOf("--host");
    if (hostIdx !== -1) {
        const hostValue = argv[hostIdx + 1];
        if (hostValue !== undefined) {
            return hostValue;
        }
    }
    return null;
}
//# sourceMappingURL=server-mode.js.map