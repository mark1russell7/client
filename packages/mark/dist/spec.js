/**
 * Declarative CLI Specification
 *
 * Maps CLI commands to client procedures.
 * This is the single source of truth for CLI structure.
 */
import { z } from "zod";
/**
 * The CLI specification
 */
export const cliSpec = {
    name: "mark",
    version: "1.0.0",
    description: "Mark CLI - Development workflow automation",
    commands: [
        // ==========================================================================
        // lib refresh
        // ==========================================================================
        {
            path: ["lib", "refresh"],
            description: "Refresh a library (clean node_modules/dist, npm install, build, commit/push)",
            procedure: ["lib", "refresh"],
            args: [
                {
                    name: "path",
                    type: "string",
                    description: "Path to the library (default: current directory)",
                    required: false,
                    position: 0,
                    default: ".",
                },
            ],
            options: [
                {
                    name: "recursive",
                    short: "r",
                    type: "boolean",
                    description: "Recursively refresh dependencies (bottom-up DAG)",
                    default: false,
                },
                {
                    name: "yes",
                    short: "y",
                    type: "boolean",
                    description: "Non-interactive mode (auto-confirm on errors)",
                    default: false,
                },
            ],
            inputSchema: z.object({
                path: z.string(),
                recursive: z.boolean(),
                autoConfirm: z.boolean(),
                sessionId: z.string().optional(),
            }),
            transform: (parsed) => ({
                path: parsed.args["path"] ?? ".",
                recursive: parsed.options["recursive"] ?? false,
                autoConfirm: parsed.options["yes"] ?? false,
            }),
        },
        // ==========================================================================
        // lib scan
        // ==========================================================================
        {
            path: ["lib", "scan"],
            description: "Scan ~/git for packages and show package-to-repo mapping",
            procedure: ["lib", "scan"],
            args: [
                {
                    name: "rootPath",
                    type: "string",
                    description: "Root path to scan (default: ~/git)",
                    required: false,
                    position: 0,
                },
            ],
            options: [],
            inputSchema: z.object({
                rootPath: z.string().optional(),
            }),
            transform: (parsed) => ({
                rootPath: parsed.args["rootPath"],
            }),
        },
    ],
};
//# sourceMappingURL=spec.js.map