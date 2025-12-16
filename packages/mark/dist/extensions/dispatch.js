/**
 * Dispatch Extension
 *
 * Adds procedure dispatch capability to the Gluegun toolbox.
 */
import { Client, LocalTransport, PROCEDURE_REGISTRY, } from "@mark1russell7/client";
// Import client packages to register their procedures
import "@mark1russell7/client-cli";
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
    PROCEDURE_REGISTRY.on("register", (procedure) => {
        if (procedure.handler) {
            registerProcedureHandler(transport, procedure);
        }
    });
    PROCEDURE_REGISTRY.on("unregister", (procedure) => {
        transport.unregister(pathToMethod(procedure.path));
    });
}
/**
 * Register a procedure handler on LocalTransport
 */
function registerProcedureHandler(transport, procedure) {
    const method = pathToMethod(procedure.path);
    transport.register(method, async (payload, message) => {
        const context = {
            metadata: message.metadata ?? {},
            path: procedure.path,
            ...(message.signal ? { signal: message.signal } : {}),
        };
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
function getClient() {
    if (!clientInstance) {
        clientInstance = createClient();
    }
    return clientInstance;
}
/**
 * Call a procedure by path
 */
async function callProcedure(procedurePath, input) {
    const client = getClient();
    const [service, ...rest] = procedurePath;
    const operation = rest.join(".");
    return client.call({ service: service, operation }, input);
}
/**
 * Generate a session ID for logging
 */
function generateSessionId() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const random = Math.random().toString(36).slice(2, 6);
    return `${timestamp}-${random}`;
}
/**
 * Add dispatch extension to toolbox
 */
export default (toolbox) => {
    const sessionId = generateSessionId();
    toolbox.dispatch = {
        call: callProcedure,
        sessionId,
    };
};
//# sourceMappingURL=dispatch.js.map