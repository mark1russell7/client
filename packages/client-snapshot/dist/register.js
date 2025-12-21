/**
 * Procedure Registration for snapshot operations
 *
 * Provides snapshot.create, snapshot.list, snapshot.restore, snapshot.diff, snapshot.delete procedures.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { snapshotCreate, snapshotList, snapshotRestore, snapshotDiff, snapshotDelete, } from "./procedures/snapshot/index.js";
import { SnapshotCreateInputSchema, SnapshotListInputSchema, SnapshotRestoreInputSchema, SnapshotDiffInputSchema, SnapshotDeleteInputSchema, } from "./types.js";
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
// Procedures
// =============================================================================
const snapshotCreateProcedure = createProcedure()
    .path(["snapshot", "create"])
    .input(zodAdapter(SnapshotCreateInputSchema))
    .output(outputSchema())
    .meta({
    description: "Create environment snapshot and upload to S3",
    args: ["name"],
    shorts: { bucket: "b", preset: "p", description: "d" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return snapshotCreate(input, ctx);
})
    .build();
const snapshotListProcedure = createProcedure()
    .path(["snapshot", "list"])
    .input(zodAdapter(SnapshotListInputSchema))
    .output(outputSchema())
    .meta({
    description: "List available snapshots in S3 bucket",
    args: [],
    shorts: { bucket: "b", prefix: "p", maxResults: "n" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return snapshotList(input, ctx);
})
    .build();
const snapshotRestoreProcedure = createProcedure()
    .path(["snapshot", "restore"])
    .input(zodAdapter(SnapshotRestoreInputSchema))
    .output(outputSchema())
    .meta({
    description: "Restore environment from S3 snapshot",
    args: ["id"],
    shorts: { bucket: "b", targetPath: "t", overwrite: "f" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return snapshotRestore(input, ctx);
})
    .build();
const snapshotDiffProcedure = createProcedure()
    .path(["snapshot", "diff"])
    .input(zodAdapter(SnapshotDiffInputSchema))
    .output(outputSchema())
    .meta({
    description: "Compare current state against a snapshot",
    args: ["id"],
    shorts: { bucket: "b" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return snapshotDiff(input, ctx);
})
    .build();
const snapshotDeleteProcedure = createProcedure()
    .path(["snapshot", "delete"])
    .input(zodAdapter(SnapshotDeleteInputSchema))
    .output(outputSchema())
    .meta({
    description: "Delete a snapshot from S3",
    args: ["id"],
    shorts: { bucket: "b" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return snapshotDelete(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerSnapshotProcedures() {
    registerProcedures([
        snapshotCreateProcedure,
        snapshotListProcedure,
        snapshotRestoreProcedure,
        snapshotDiffProcedure,
        snapshotDeleteProcedure,
    ]);
}
// Auto-register
registerSnapshotProcedures();
//# sourceMappingURL=register.js.map