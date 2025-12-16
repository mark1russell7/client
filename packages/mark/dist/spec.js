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
                    name: "all",
                    short: "a",
                    type: "boolean",
                    description: "Refresh all ecosystem packages",
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
                all: z.boolean(),
                autoConfirm: z.boolean(),
                sessionId: z.string().optional(),
            }),
            transform: (parsed) => ({
                path: parsed.args["path"] ?? ".",
                recursive: parsed.options["recursive"] ?? false,
                all: parsed.options["all"] ?? false,
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
        // ==========================================================================
        // lib rename
        // ==========================================================================
        {
            path: ["lib", "rename"],
            description: "Rename a package across the codebase (updates imports and dependencies)",
            procedure: ["lib", "rename"],
            args: [
                {
                    name: "oldName",
                    type: "string",
                    description: "Current package name",
                    required: true,
                    position: 0,
                },
                {
                    name: "newName",
                    type: "string",
                    description: "New package name",
                    required: true,
                    position: 1,
                },
            ],
            options: [
                {
                    name: "root",
                    short: "r",
                    type: "string",
                    description: "Root path to scan (default: ~/git)",
                    default: undefined,
                },
                {
                    name: "dry-run",
                    short: "d",
                    type: "boolean",
                    description: "Preview changes without applying",
                    default: false,
                },
            ],
            inputSchema: z.object({
                oldName: z.string(),
                newName: z.string(),
                rootPath: z.string().optional(),
                dryRun: z.boolean().optional(),
            }),
            transform: (parsed) => ({
                oldName: parsed.args["oldName"],
                newName: parsed.args["newName"],
                rootPath: parsed.options["root"],
                dryRun: parsed.options["dry-run"] ?? false,
            }),
        },
        // ==========================================================================
        // lib install
        // ==========================================================================
        {
            path: ["lib", "install"],
            description: "Install entire ecosystem (clone missing, install deps, build in DAG order)",
            procedure: ["lib", "install"],
            args: [],
            options: [
                {
                    name: "root",
                    short: "r",
                    type: "string",
                    description: "Root path for packages (default: ~/git)",
                    default: undefined,
                },
                {
                    name: "dry-run",
                    short: "d",
                    type: "boolean",
                    description: "Preview what would be cloned without installing",
                    default: false,
                },
                {
                    name: "continue",
                    short: "c",
                    type: "boolean",
                    description: "Continue on error instead of stopping",
                    default: false,
                },
                {
                    name: "concurrency",
                    short: "j",
                    type: "number",
                    description: "Max parallel operations (default: 4)",
                    default: 4,
                },
            ],
            inputSchema: z.object({
                rootPath: z.string().optional(),
                dryRun: z.boolean().optional(),
                continueOnError: z.boolean().optional(),
                concurrency: z.number().optional(),
            }),
            transform: (parsed) => ({
                rootPath: parsed.options["root"],
                dryRun: parsed.options["dry-run"] ?? false,
                continueOnError: parsed.options["continue"] ?? false,
                concurrency: Number(parsed.options["concurrency"]) || 4,
            }),
        },
        // ==========================================================================
        // config init
        // ==========================================================================
        {
            path: ["config", "init"],
            description: "Initialize project with dependencies.json using a preset",
            procedure: ["config", "init"],
            args: [],
            options: [
                {
                    name: "preset",
                    short: "p",
                    type: "string",
                    description: "Preset to use (lib, react-lib, app)",
                    default: "lib",
                },
                {
                    name: "force",
                    short: "f",
                    type: "boolean",
                    description: "Force overwrite existing dependencies.json",
                    default: false,
                },
            ],
            inputSchema: z.object({
                path: z.string().optional(),
                preset: z.string().optional(),
                force: z.boolean().optional(),
            }),
            transform: (parsed) => ({
                preset: parsed.options["preset"],
                force: parsed.options["force"] ?? false,
            }),
        },
        // ==========================================================================
        // config add
        // ==========================================================================
        {
            path: ["config", "add"],
            description: "Add a feature to dependencies.json",
            procedure: ["config", "add"],
            args: [
                {
                    name: "feature",
                    type: "string",
                    description: "Feature to add",
                    required: true,
                    position: 0,
                },
            ],
            options: [],
            inputSchema: z.object({
                feature: z.string(),
                path: z.string().optional(),
            }),
            transform: (parsed) => ({
                feature: parsed.args["feature"],
            }),
        },
        // ==========================================================================
        // config remove
        // ==========================================================================
        {
            path: ["config", "remove"],
            description: "Remove a feature from dependencies.json",
            procedure: ["config", "remove"],
            args: [
                {
                    name: "feature",
                    type: "string",
                    description: "Feature to remove",
                    required: true,
                    position: 0,
                },
            ],
            options: [],
            inputSchema: z.object({
                feature: z.string(),
                path: z.string().optional(),
            }),
            transform: (parsed) => ({
                feature: parsed.args["feature"],
            }),
        },
        // ==========================================================================
        // config generate
        // ==========================================================================
        {
            path: ["config", "generate"],
            description: "Generate package.json, tsconfig.json, .gitignore from dependencies.json",
            procedure: ["config", "generate"],
            args: [],
            options: [],
            inputSchema: z.object({
                path: z.string().optional(),
            }),
            transform: () => ({}),
        },
        // ==========================================================================
        // config validate
        // ==========================================================================
        {
            path: ["config", "validate"],
            description: "Validate dependencies.json against schema",
            procedure: ["config", "validate"],
            args: [],
            options: [],
            inputSchema: z.object({
                path: z.string().optional(),
            }),
            transform: () => ({}),
        },
    ],
};
//# sourceMappingURL=spec.js.map