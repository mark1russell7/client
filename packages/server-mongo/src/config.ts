/**
 * Server Configuration
 *
 * Environment-based configuration for the MongoDB server.
 */

export interface ServerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host: string;
  /** MongoDB connection URI */
  mongoUri: string;
  /** Database name */
  database: string;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

export function loadConfig(): ServerConfig {
  return {
    port: getEnvNumber("PORT", 3000),
    host: getEnv("HOST", "0.0.0.0"),
    mongoUri: getEnv("MONGODB_URI", "mongodb://localhost:27017"),
    database: getEnv("MONGODB_DATABASE", "test"),
  };
}

export const config: ServerConfig = loadConfig();
