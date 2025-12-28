/**
 * server.mongo.start procedure - Start MongoDB peer server
 */
import { mongoServerManager } from "../../server-manager.js";
// Dynamic imports to avoid circular dependencies
let createPeerFn;
let connectFn;
async function ensureImports() {
    if (!createPeerFn) {
        const clientServer = await import("@mark1russell7/client-server");
        createPeerFn = clientServer.createPeer;
    }
    if (!connectFn) {
        const clientMongo = await import("@mark1russell7/client-mongo");
        connectFn = clientMongo.connect;
    }
}
export async function serverMongoStart(input) {
    await ensureImports();
    const { port = 3000, host = "0.0.0.0", mongoUri, database } = input;
    // Import and register mongo procedures
    const { registerMongoProcedures } = await import("@mark1russell7/client-mongo");
    registerMongoProcedures();
    // Connect to MongoDB if URI provided
    if (mongoUri || database) {
        const connect = connectFn;
        const connectOpts = {};
        if (mongoUri)
            connectOpts.uri = mongoUri;
        if (database)
            connectOpts.database = database;
        await connect(connectOpts);
    }
    // Create peer with HTTP transport
    const createPeer = createPeerFn;
    const peer = await createPeer({
        id: `mongo-peer-${Date.now()}`,
        transports: [
            {
                type: "http",
                port,
                host,
                basePath: "/api",
                cors: true,
            },
        ],
        autoRegister: true,
    });
    await peer.start();
    const endpoints = peer.getEndpoints();
    const procedureCount = peer.getServer().getProcedureCount();
    const serverId = mongoServerManager.register(peer, endpoints, procedureCount);
    return {
        serverId,
        endpoints,
        procedureCount,
    };
}
//# sourceMappingURL=start.js.map