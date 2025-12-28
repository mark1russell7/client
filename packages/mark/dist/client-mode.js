"use strict";
/**
 * CLI Client Mode
 *
 * Connects to a running CLI server and executes commands remotely.
 * Falls back to local execution if no server is available.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryClientMode = tryClientMode;
const lockfile_1 = require("./lockfile");
const parse_1 = require("./parse");
/**
 * Try to execute command via running server
 * Returns null if no server available (should fall back to local)
 */
async function tryClientMode(path, args, options, procedures) {
    // Check for running server
    const lockfile = await (0, lockfile_1.readLockfile)();
    if (!lockfile) {
        return null; // No lockfile, fall back to local
    }
    // Verify server is still alive
    if (!(await (0, lockfile_1.isServerAlive)(lockfile))) {
        return null; // Server not running, fall back to local
    }
    try {
        // Dynamic import client
        const clientModule = await import("@mark1russell7/client");
        const { Client, HttpTransport } = clientModule;
        // Connect to server
        const transport = new HttpTransport({
            baseUrl: lockfile.endpoint,
        });
        const client = new Client({ transport });
        // Find matching procedure to get input schema
        const proc = findProcedure(procedures, path);
        if (!proc) {
            return null; // Unknown procedure, fall back to local
        }
        // Parse input from CLI args
        const meta = (proc.metadata ?? {});
        const parameters = { array: args, options };
        let input = (0, parse_1.parseFromSchema)(parameters, meta);
        // Validate input if schema exists
        if (proc.input) {
            input = proc.input.parse(input);
        }
        // Convert path to method
        const [service, ...rest] = path;
        const method = { service: service, operation: rest.join(".") };
        // Execute remotely
        const result = await client.call(method, input);
        return {
            success: true,
            result,
        };
    }
    catch (error) {
        // Connection failed or other error - fall back to local
        return null;
    }
}
/**
 * Find a procedure matching the given path
 */
function findProcedure(procedures, path) {
    return procedures.find((p) => {
        if (p.path.length !== path.length)
            return false;
        return p.path.every((seg, i) => seg === path[i]);
    });
}
//# sourceMappingURL=client-mode.js.map