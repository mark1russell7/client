/**
 * Server Configuration
 *
 * Environment-based configuration for the MongoDB server.
 */
function getEnv(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}
function getEnvNumber(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined)
        return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}
export function loadConfig() {
    return {
        port: getEnvNumber("PORT", 3000),
        host: getEnv("HOST", "0.0.0.0"),
        mongoUri: getEnv("MONGODB_URI", "mongodb://localhost:27017"),
        database: getEnv("MONGODB_DATABASE", "test"),
    };
}
export const config = loadConfig();
//# sourceMappingURL=config.js.map