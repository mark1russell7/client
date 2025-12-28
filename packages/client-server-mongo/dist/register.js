/**
 * Procedure Registration for MongoDB server management
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { serverMongoStart } from "./procedures/server/start.js";
import { serverMongoStop } from "./procedures/server/stop.js";
import { serverMongoStatus } from "./procedures/server/status.js";
import { serverMongoConnect } from "./procedures/server/connect.js";
import { ServerMongoStartInputSchema, ServerMongoStopInputSchema, ServerMongoStatusInputSchema, ServerMongoConnectInputSchema, } from "./types.js";
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
const serverMongoStartProcedure = createProcedure()
    .path(["server", "mongo", "start"])
    .input(zodAdapter(ServerMongoStartInputSchema))
    .output(outputSchema())
    .meta({
    description: "Start MongoDB peer server",
    args: [],
    shorts: { port: "p", host: "h" },
    output: "json",
})
    .handler(async (input) => serverMongoStart(input))
    .build();
const serverMongoStopProcedure = createProcedure()
    .path(["server", "mongo", "stop"])
    .input(zodAdapter(ServerMongoStopInputSchema))
    .output(outputSchema())
    .meta({
    description: "Stop MongoDB peer server",
    args: ["serverId"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => serverMongoStop(input))
    .build();
const serverMongoStatusProcedure = createProcedure()
    .path(["server", "mongo", "status"])
    .input(zodAdapter(ServerMongoStatusInputSchema))
    .output(outputSchema())
    .meta({
    description: "Get MongoDB server status",
    args: [],
    shorts: {},
    output: "json",
})
    .handler(async (input) => serverMongoStatus(input))
    .build();
const serverMongoConnectProcedure = createProcedure()
    .path(["server", "mongo", "connect"])
    .input(zodAdapter(ServerMongoConnectInputSchema))
    .output(outputSchema())
    .meta({
    description: "Connect to MongoDB database",
    args: [],
    shorts: { uri: "u", database: "d" },
    output: "json",
})
    .handler(async (input) => serverMongoConnect(input))
    .build();
export function registerServerMongoProcedures() {
    registerProcedures([
        serverMongoStartProcedure,
        serverMongoStopProcedure,
        serverMongoStatusProcedure,
        serverMongoConnectProcedure,
    ]);
}
// Auto-register
registerServerMongoProcedures();
//# sourceMappingURL=register.js.map