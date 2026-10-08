/**
 * Procedure Registration for connection operations
 *
 * Registers connection.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { list } from "./procedures/connection/list.js";
import { get } from "./procedures/connection/get.js";
import { call } from "./procedures/connection/call.js";
import { broadcast } from "./procedures/connection/broadcast.js";
import { subscribe } from "./procedures/connection/subscribe.js";
import { unsubscribe } from "./procedures/connection/unsubscribe.js";
import { publish } from "./procedures/connection/publish.js";
import {
  ListInputSchema,
  GetInputSchema,
  CallInputSchema,
  BroadcastInputSchema,
  SubscribeInputSchema,
  UnsubscribeInputSchema,
  PublishInputSchema,
  type ListInput,
  type ListOutput,
  type GetInput,
  type GetOutput,
  type CallInput,
  type CallOutput,
  type BroadcastInput,
  type BroadcastOutput,
  type SubscribeInput,
  type SubscribeOutput,
  type UnsubscribeInput,
  type UnsubscribeOutput,
  type PublishInput,
  type PublishOutput,
} from "./types.js";

// =============================================================================
// Procedure Definitions
// =============================================================================

const connectionListProcedure = createProcedure()
  .path(["connection", "list"])
  .input(zodAdapter<ListInput>(ListInputSchema))
  .output(outputSchema<ListOutput>())
  .meta({
    description: "List all connected clients",
    args: [],
    shorts: { serverId: "s" },
    output: "json",
  })
  .handler(async (input: ListInput): Promise<ListOutput> => {
    return list(input);
  })
  .build();

const connectionGetProcedure = createProcedure()
  .path(["connection", "get"])
  .input(zodAdapter<GetInput>(GetInputSchema))
  .output(outputSchema<GetOutput>())
  .meta({
    description: "Get specific connection info",
    args: ["clientId"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: GetInput): Promise<GetOutput> => {
    return get(input);
  })
  .build();

const connectionCallProcedure = createProcedure()
  .path(["connection", "call"])
  .input(zodAdapter<CallInput>(CallInputSchema))
  .output(outputSchema<CallOutput>())
  .meta({
    description: "Call procedure on specific client",
    args: ["clientId"],
    shorts: { timeout: "t" },
    output: "json",
  })
  .handler(async (input: CallInput): Promise<CallOutput> => {
    return call(input);
  })
  .build();

const connectionBroadcastProcedure = createProcedure()
  .path(["connection", "broadcast"])
  .input(zodAdapter<BroadcastInput>(BroadcastInputSchema))
  .output(outputSchema<BroadcastOutput>())
  .meta({
    description: "Call procedure on all connected clients",
    args: [],
    shorts: { waitForResponses: "w", timeout: "t" },
    output: "json",
  })
  .handler(async (input: BroadcastInput): Promise<BroadcastOutput> => {
    return broadcast(input);
  })
  .build();

const connectionSubscribeProcedure = createProcedure()
  .path(["connection", "subscribe"])
  .input(zodAdapter<SubscribeInput>(SubscribeInputSchema))
  .output(outputSchema<SubscribeOutput>())
  .meta({
    description: "Subscribe to a topic",
    args: ["topic"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: SubscribeInput): Promise<SubscribeOutput> => {
    return subscribe(input);
  })
  .build();

const connectionUnsubscribeProcedure = createProcedure()
  .path(["connection", "unsubscribe"])
  .input(zodAdapter<UnsubscribeInput>(UnsubscribeInputSchema))
  .output(outputSchema<UnsubscribeOutput>())
  .meta({
    description: "Unsubscribe from a topic",
    args: ["subscriptionId"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: UnsubscribeInput): Promise<UnsubscribeOutput> => {
    return unsubscribe(input);
  })
  .build();

const connectionPublishProcedure = createProcedure()
  .path(["connection", "publish"])
  .input(zodAdapter<PublishInput>(PublishInputSchema))
  .output(outputSchema<PublishOutput>())
  .meta({
    description: "Publish data to topic subscribers",
    args: ["topic"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: PublishInput): Promise<PublishOutput> => {
    return publish(input);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerConnectionProcedures(): void {
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
