/**
 * server.mongo.connect procedure - Connect to MongoDB
 */
let connectFn;
async function ensureImports() {
    if (!connectFn) {
        const clientMongo = await import("@mark1russell7/client-mongo");
        connectFn = clientMongo.connect;
    }
}
export async function serverMongoConnect(input) {
    await ensureImports();
    const { uri, database } = input;
    const connect = connectFn;
    const connectOpts = {};
    if (uri)
        connectOpts.uri = uri;
    if (database)
        connectOpts.database = database;
    const result = await connect(connectOpts);
    return {
        success: true,
        database: result.database,
    };
}
//# sourceMappingURL=connect.js.map