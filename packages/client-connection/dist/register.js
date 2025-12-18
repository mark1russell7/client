/**
 * Procedure Registration for connection operations
 *
 * Registers connection.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { list } from "./procedures/connection/list.js";
import { get } from "./procedures/connection/get.js";
import { call } from "./procedures/connection/call.js";
import { broadcast } from "./procedures/connection/broadcast.js";
import { subscribe } from "./procedures/connection/subscribe.js";
import { unsubscribe } from "./procedures/connection/unsubscribe.js";
import { publish } from "./procedures/connection/publish.js";
import { ListInputSchema, GetInputSchema, CallInputSchema, BroadcastInputSchema, SubscribeInputSchema, UnsubscribeInputSchema, PublishInputSchema, } from "./types.js";
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
const connectionListProcedure = createProcedure()
    .path(["connection", "list"])
    .input(zodAdapter(ListInputSchema))
    .output(outputSchema())
    .meta({
    description: "List all connected clients",
    args: [],
    shorts: { serverId: "s" },
    output: "json",
})
    .handler(async (input) => {
    return list(input);
})
    .build();
const connectionGetProcedure = createProcedure()
    .path(["connection", "get"])
    .input(zodAdapter(GetInputSchema))
    .output(outputSchema())
    .meta({
    description: "Get specific connection info",
    args: ["clientId"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return get(input);
})
    .build();
const connectionCallProcedure = createProcedure()
    .path(["connection", "call"])
    .input(zodAdapter(CallInputSchema))
    .output(outputSchema())
    .meta({
    description: "Call procedure on specific client",
    args: ["clientId"],
    shorts: { timeout: "t" },
    output: "json",
})
    .handler(async (input) => {
    return call(input);
})
    .build();
const connectionBroadcastProcedure = createProcedure()
    .path(["connection", "broadcast"])
    .input(zodAdapter(BroadcastInputSchema))
    .output(outputSchema())
    .meta({
    description: "Call procedure on all connected clients",
    args: [],
    shorts: { waitForResponses: "w", timeout: "t" },
    output: "json",
})
    .handler(async (input) => {
    return broadcast(input);
})
    .build();
const connectionSubscribeProcedure = createProcedure()
    .path(["connection", "subscribe"])
    .input(zodAdapter(SubscribeInputSchema))
    .output(outputSchema())
    .meta({
    description: "Subscribe to a topic",
    args: ["topic"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return subscribe(input);
})
    .build();
const connectionUnsubscribeProcedure = createProcedure()
    .path(["connection", "unsubscribe"])
    .input(zodAdapter(UnsubscribeInputSchema))
    .output(outputSchema())
    .meta({
    description: "Unsubscribe from a topic",
    args: ["subscriptionId"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return unsubscribe(input);
})
    .build();
const connectionPublishProcedure = createProcedure()
    .path(["connection", "publish"])
    .input(zodAdapter(PublishInputSchema))
    .output(outputSchema())
    .meta({
    description: "Publish data to topic subscribers",
    args: ["topic"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return publish(input);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerConnectionProcedures() {
    registerProcedures([
        connectionListProcedure,
        connectionGetProcedure,
        connectionCallProcedure,
        connectionBroadcastProcedure,
        connectionSubscribeProcedure,
        connectionUnsubscribeProcedure,
        connectionPublishProcedure,
    ]);
}
// Auto-register when this module is loaded
registerConnectionProcedures();
//# sourceMappingURL=register.js.map