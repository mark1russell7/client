#!/usr/bin/env node
/**
 * General Procedure Server CLI
 *
 * Starts a server that exposes registered procedures via HTTP/WebSocket.
 * Uses server.create procedure internally (dogfooding).
 *
 * Usage:
 *   server --procedures @mark1russell7/client-mongo/register --port 3000
 */
import { parseConfig } from "./config.js";
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
    // Helper to execute a procedure by path (for ctx.client.call)
    async function execProcedure(path, input) {
        const proc = registry.get(path);
        if (!proc || !proc.handler) {
            throw new Error(`Procedure not found: ${path.join(".")}`);
        }
        const ctx = createContext(path);
        return proc.handler(input, ctx);
    }
    // Helper to create ProcedureContext with client.call support
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
 * Main entry point
 */
async function main() {
    const config = parseConfig(process.argv.slice(2));
    console.log("Starting procedure server...");
    if (config.verbose) {
        console.log("  Procedures:", config.procedures.join(", ") || "(none specified)");
        console.log("  Transports:", config.transports.map((t) => t.type).join(", "));
    }
    // Dynamic imports for ESM packages
    const clientModule = await import("@mark1russell7/client");
    const { Client, LocalTransport, PROCEDURE_REGISTRY } = clientModule;
    // Import client-server to register server.create procedure
    const clientServer = await import("@mark1russell7/client-server");
    clientServer.registerServerProcedures();
    // Dynamically import procedure packages
    for (const pkg of config.procedures) {
        if (config.verbose) {
            console.log(`  Loading: ${pkg}`);
        }
        try {
            await import(pkg);
        }
        catch (error) {
            console.error(`Failed to load procedure package: ${pkg}`);
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }
    // Create local transport and sync registry
    const transport = new LocalTransport();
    syncRegistryToTransport(transport, PROCEDURE_REGISTRY);
    const client = new Client({ transport });
    // Get procedure count before starting
    const procedureCount = PROCEDURE_REGISTRY.getAll().length;
    if (config.verbose) {
        console.log(`  Registered procedures: ${procedureCount}`);
    }
    // DOGFOOD: Use server.create procedure to start the server
    const result = await client.call({ service: "server", operation: "create" }, {
        transports: config.transports,
        autoRegister: true,
    });
    console.log("\nServer started!");
    console.log(`  Server ID: ${result.serverId}`);
    console.log(`  Procedures: ${result.procedureCount}`);
    console.log("\nEndpoints:");
    for (const endpoint of result.endpoints) {
        console.log(`  [${endpoint.type}] ${endpoint.address}`);
    }
    console.log("\nPress Ctrl+C to stop the server.");
    // Handle shutdown
    process.on("SIGINT", () => {
        console.log("\nShutting down...");
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        console.log("\nShutting down...");
        process.exit(0);
    });
    // Keep the process alive
    await new Promise(() => {
        // Never resolves - keeps process running
    });
}
main().catch((error) => {
    console.error("Server failed to start:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
//# sourceMappingURL=cli.js.map