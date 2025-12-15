/**
 * Generic Dispatcher
 *
 * Dispatches CLI commands to client procedures.
 * This is the core of the declarative CLI system.
 */
import { Client, LocalTransport, PROCEDURE_REGISTRY, } from "@mark1russell7/client";
// Import client-cli to register its procedures
import "@mark1russell7/client-cli";
// Import client-logger for logging
import "@mark1russell7/client-logger";
/**
 * Convert a procedure path to a transport method
 */
function pathToMethod(path) {
    const [service, ...rest] = path;
    return {
        service: service,
        operation: rest.join("."),
    };
}
/**
 * Sync procedures from PROCEDURE_REGISTRY to LocalTransport
 */
function syncRegistryToTransport(transport) {
    for (const procedure of PROCEDURE_REGISTRY.getAll()) {
        if (procedure.handler) {
            registerProcedureHandler(transport, procedure);
        }
    }
    // Listen for new registrations
    PROCEDURE_REGISTRY.on("register", (procedure) => {
        if (procedure.handler) {
            registerProcedureHandler(transport, procedure);
        }
    });
    // Listen for unregistrations
    PROCEDURE_REGISTRY.on("unregister", (procedure) => {
        transport.unregister(pathToMethod(procedure.path));
    });
}
/**
 * Register a procedure handler on LocalTransport
 */
function registerProcedureHandler(transport, procedure) {
    const method = pathToMethod(procedure.path);
    // Wrap procedure handler to adapt signature
    transport.register(method, async (payload, message) => {
        // Create minimal procedure context from message
        // Use conditional property to satisfy exactOptionalPropertyTypes
        const context = {
            metadata: message.metadata ?? {},
            path: procedure.path,
            ...(message.signal ? { signal: message.signal } : {}),
        };
        // Call the procedure handler
        return procedure.handler(payload, context);
    });
}
/**
 * Create a client instance with local transport
 */
function createClient() {
    const transport = new LocalTransport();
    syncRegistryToTransport(transport);
    return new Client({ transport });
}
// Singleton client instance
let clientInstance = null;
/**
 * Get the client instance (lazy initialization)
 */
function getClient() {
    if (!clientInstance) {
        clientInstance = createClient();
    }
    return clientInstance;
}
/**
 * Dispatch a CLI command to its corresponding procedure
 *
 * @param spec - The command specification
 * @param parsed - The parsed CLI arguments
 * @returns The procedure result
 */
export async function dispatch(spec, parsed) {
    const client = getClient();
    // Transform args to payload
    const payload = spec.transform
        ? spec.transform(parsed)
        : { ...parsed.args, ...parsed.options };
    // Validate if schema provided
    if (spec.inputSchema) {
        spec.inputSchema.parse(payload);
    }
    // Build the method from procedure path
    const [service, ...rest] = spec.procedure;
    const operation = rest.join(".");
    // Call the procedure
    const result = await client.call({ service: service, operation }, payload);
    return result;
}
/**
 * Format the result for CLI output
 */
export function formatResult(result) {
    if (typeof result === "string") {
        return result;
    }
    return JSON.stringify(result, null, 2);
}
//# sourceMappingURL=dispatch.js.map