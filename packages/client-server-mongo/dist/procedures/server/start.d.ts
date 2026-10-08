/**
 * server.mongo.start procedure - Start MongoDB peer server
 *
 * Uses server.create procedure internally (dogfooding) to create the peer.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { ServerMongoStartInput, ServerMongoStartOutput } from "../../types.js";
/**
 * Start a MongoDB peer server
 *
 * This procedure:
 * 1. Registers mongo procedures
 * 2. Connects to MongoDB (if URI provided)
 * 3. Calls server.create procedure (dogfooding) to create the peer
 */
export declare function serverMongoStart(input: ServerMongoStartInput, ctx: ProcedureContext): Promise<ServerMongoStartOutput>;
//# sourceMappingURL=start.d.ts.map