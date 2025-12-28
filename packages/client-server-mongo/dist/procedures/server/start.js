/**
 * server.mongo.start procedure - Start MongoDB peer server
 *
 * Uses server.create procedure internally (dogfooding) to create the peer.
 */
/**
 * Start a MongoDB peer server
 *
 * This procedure:
 * 1. Registers mongo procedures
 * 2. Connects to MongoDB (if URI provided)
 * 3. Calls server.create procedure (dogfooding) to create the peer
 */
export async function serverMongoStart(input, ctx) {
    const { port = 3000, host = "0.0.0.0", mongoUri, database, transports } = input;
    // Import client-mongo (auto-registers procedures on import)
    await import("@mark1russell7/client-mongo");
    // Connect to MongoDB if URI provided
    if (mongoUri || database) {
        const { connect } = await import("@mark1russell7/client-mongo");
        const connectOpts = {};
        if (mongoUri)
            connectOpts.uri = mongoUri;
        if (database)
            connectOpts.database = database;
        await connect(connectOpts);
    }
    // Build transport configuration
    const transportConfig = transports ?? [
        {
            type: "http",
            port,
            host,
            basePath: "/api",
            cors: true,
        },
    ];
    // DOGFOOD: Use server.create procedure to create the peer
    const result = await ctx.client.call(["server", "create"], {
        transports: transportConfig,
        autoRegister: true,
    });
    return {
        serverId: result.serverId,
        endpoints: result.endpoints,
        procedureCount: result.procedureCount,
    };
}
//# sourceMappingURL=start.js.map