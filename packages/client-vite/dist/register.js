/**
 * Procedure Registration for Vite dev server management
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { viteDev } from "./procedures/vite/dev.js";
import { viteBuild } from "./procedures/vite/build.js";
import { vitePreview } from "./procedures/vite/preview.js";
import { viteStop } from "./procedures/vite/stop.js";
import { ViteDevInputSchema, ViteBuildInputSchema, VitePreviewInputSchema, ViteStopInputSchema, } from "./types.js";
function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                return { success: true, data: schema.parse(data) };
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
const viteDevProcedure = createProcedure()
    .path(["vite", "dev"])
    .input(zodAdapter(ViteDevInputSchema))
    .output(outputSchema())
    .meta({
    description: "Start Vite dev server",
    args: ["cwd"],
    shorts: { port: "p", host: "h" },
    output: "json",
})
    .handler(async (input) => viteDev(input))
    .build();
const viteBuildProcedure = createProcedure()
    .path(["vite", "build"])
    .input(zodAdapter(ViteBuildInputSchema))
    .output(outputSchema())
    .meta({
    description: "Build for production",
    args: ["cwd"],
    shorts: { outDir: "o", mode: "m" },
    output: "json",
})
    .handler(async (input) => viteBuild(input))
    .build();
const vitePreviewProcedure = createProcedure()
    .path(["vite", "preview"])
    .input(zodAdapter(VitePreviewInputSchema))
    .output(outputSchema())
    .meta({
    description: "Preview production build",
    args: ["cwd"],
    shorts: { port: "p" },
    output: "json",
})
    .handler(async (input) => vitePreview(input))
    .build();
const viteStopProcedure = createProcedure()
    .path(["vite", "stop"])
    .input(zodAdapter(ViteStopInputSchema))
    .output(outputSchema())
    .meta({
    description: "Stop a running Vite server",
    args: ["serverId"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => viteStop(input))
    .build();
export function registerViteProcedures() {
    registerProcedures([
        viteDevProcedure,
        viteBuildProcedure,
        vitePreviewProcedure,
        viteStopProcedure,
    ]);
}
// Auto-register
registerViteProcedures();
//# sourceMappingURL=register.js.map