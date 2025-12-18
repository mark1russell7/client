/**
 * Procedure Registration for filesystem operations
 *
 * Registers fs.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { read } from "./procedures/fs/read.js";
import { write } from "./procedures/fs/write.js";
import { exists } from "./procedures/fs/exists.js";
import { mkdir } from "./procedures/fs/mkdir.js";
import { rm } from "./procedures/fs/rm.js";
import { readdir } from "./procedures/fs/readdir.js";
import { stat } from "./procedures/fs/stat.js";
import { copy } from "./procedures/fs/copy.js";
import { move } from "./procedures/fs/move.js";
import { glob } from "./procedures/fs/glob.js";
import { readJson } from "./procedures/fs/json.js";
import { ReadInputSchema, WriteInputSchema, ExistsInputSchema, MkdirInputSchema, RmInputSchema, ReaddirInputSchema, StatInputSchema, CopyInputSchema, MoveInputSchema, GlobInputSchema, ReadJsonInputSchema, } from "./types.js";
function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                const parsed = schema.parse(data);
                return { success: true, data: parsed };
            }
            catch (error) {
                const err = error;
                return {
                    success: false,
                    error: {
                        message: err.message ?? "Validation failed",
                        errors: Array.isArray(err.errors)
                            ? err.errors.map((e) => {
                                const errObj = e;
                                return {
                                    path: (errObj.path ?? []),
                                    message: errObj.message ?? "Unknown error",
                                };
                            })
                            : [],
                    },
                };
            }
        },
        _output: undefined,
    };
}
function outputSchema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
// =============================================================================
// Procedure Definitions
// =============================================================================
const fsReadProcedure = createProcedure()
    .path(["fs", "read"])
    .input(zodAdapter(ReadInputSchema))
    .output(outputSchema())
    .meta({
    description: "Read file contents",
    args: ["path"],
    shorts: { encoding: "e" },
    output: "json",
})
    .handler(async (input) => {
    return read(input);
})
    .build();
const fsWriteProcedure = createProcedure()
    .path(["fs", "write"])
    .input(zodAdapter(WriteInputSchema))
    .output(outputSchema())
    .meta({
    description: "Write content to file",
    args: ["path", "content"],
    shorts: { encoding: "e", mode: "m" },
    output: "json",
})
    .handler(async (input) => {
    return write(input);
})
    .build();
const fsExistsProcedure = createProcedure()
    .path(["fs", "exists"])
    .input(zodAdapter(ExistsInputSchema))
    .output(outputSchema())
    .meta({
    description: "Check if file or directory exists",
    args: ["path"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return exists(input);
})
    .build();
const fsMkdirProcedure = createProcedure()
    .path(["fs", "mkdir"])
    .input(zodAdapter(MkdirInputSchema))
    .output(outputSchema())
    .meta({
    description: "Create directory",
    args: ["path"],
    shorts: { recursive: "r" },
    output: "json",
})
    .handler(async (input) => {
    return mkdir(input);
})
    .build();
const fsRmProcedure = createProcedure()
    .path(["fs", "rm"])
    .input(zodAdapter(RmInputSchema))
    .output(outputSchema())
    .meta({
    description: "Remove file or directory",
    args: ["path"],
    shorts: { recursive: "r", force: "f" },
    output: "json",
})
    .handler(async (input) => {
    return rm(input);
})
    .build();
const fsReaddirProcedure = createProcedure()
    .path(["fs", "readdir"])
    .input(zodAdapter(ReaddirInputSchema))
    .output(outputSchema())
    .meta({
    description: "Read directory contents",
    args: ["path"],
    shorts: { recursive: "r", includeStats: "s" },
    output: "json",
})
    .handler(async (input) => {
    return readdir(input);
})
    .build();
const fsStatProcedure = createProcedure()
    .path(["fs", "stat"])
    .input(zodAdapter(StatInputSchema))
    .output(outputSchema())
    .meta({
    description: "Get file or directory stats",
    args: ["path"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return stat(input);
})
    .build();
const fsCopyProcedure = createProcedure()
    .path(["fs", "copy"])
    .input(zodAdapter(CopyInputSchema))
    .output(outputSchema())
    .meta({
    description: "Copy file or directory",
    args: ["src", "dest"],
    shorts: { recursive: "r", overwrite: "o" },
    output: "json",
})
    .handler(async (input) => {
    return copy(input);
})
    .build();
const fsMoveProcedure = createProcedure()
    .path(["fs", "move"])
    .input(zodAdapter(MoveInputSchema))
    .output(outputSchema())
    .meta({
    description: "Move or rename file/directory",
    args: ["src", "dest"],
    shorts: { overwrite: "o" },
    output: "json",
})
    .handler(async (input) => {
    return move(input);
})
    .build();
const fsGlobProcedure = createProcedure()
    .path(["fs", "glob"])
    .input(zodAdapter(GlobInputSchema))
    .output(outputSchema())
    .meta({
    description: "Find files matching glob pattern",
    args: ["pattern"],
    shorts: { cwd: "c", absolute: "a", dot: "d" },
    output: "json",
})
    .handler(async (input) => {
    return glob(input);
})
    .build();
const fsReadJsonProcedure = createProcedure()
    .path(["fs", "read.json"])
    .input(zodAdapter(ReadJsonInputSchema))
    .output(outputSchema())
    .meta({
    description: "Read and parse JSON file",
    args: ["path"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return readJson(input);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerFsProcedures() {
    registerProcedures([
        fsReadProcedure,
        fsWriteProcedure,
        fsExistsProcedure,
        fsMkdirProcedure,
        fsRmProcedure,
        fsReaddirProcedure,
        fsStatProcedure,
        fsCopyProcedure,
        fsMoveProcedure,
        fsGlobProcedure,
        fsReadJsonProcedure,
    ]);
}
// Auto-register when this module is loaded
registerFsProcedures();
//# sourceMappingURL=register.js.map