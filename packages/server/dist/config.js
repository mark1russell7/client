/**
 * Configuration Parser
 *
 * Parses command line arguments for the server.
 */
/**
 * Parse command line arguments into server configuration.
 *
 * Usage:
 *   server --procedures @mark1russell7/client-mongo/register --port 3000
 *   server --procedures pkg1,pkg2 --transport http,websocket
 */
export function parseConfig(argv) {
    const config = {
        procedures: [],
        transports: [],
        verbose: false,
    };
    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === "--procedures" || arg === "-p") {
            const value = argv[++i];
            if (value) {
                config.procedures = value.split(",").map((p) => p.trim());
            }
        }
        else if (arg === "--port") {
            const value = argv[++i];
            if (value) {
                const port = parseInt(value, 10);
                if (!isNaN(port)) {
                    // Apply port to first transport or create default HTTP
                    if (config.transports.length === 0) {
                        config.transports.push({ type: "http", port, cors: true });
                    }
                    else {
                        config.transports[0].port = port;
                    }
                }
            }
        }
        else if (arg === "--host") {
            const value = argv[++i];
            if (value) {
                if (config.transports.length === 0) {
                    config.transports.push({ type: "http", host: value, cors: true });
                }
                else {
                    config.transports[0].host = value;
                }
            }
        }
        else if (arg === "--transport" || arg === "-t") {
            const value = argv[++i];
            if (value) {
                const types = value.split(",").map((t) => t.trim());
                for (const type of types) {
                    if (type === "http" || type === "websocket" || type === "local") {
                        const existing = config.transports.find((t) => t.type === type);
                        if (!existing) {
                            config.transports.push({
                                type,
                                ...(type === "http" ? { cors: true, basePath: "/api" } : {}),
                                ...(type === "websocket" ? { path: "/ws" } : {}),
                            });
                        }
                    }
                }
            }
        }
        else if (arg === "--cors") {
            const httpTransport = config.transports.find((t) => t.type === "http");
            if (httpTransport) {
                httpTransport.cors = true;
            }
        }
        else if (arg === "--no-cors") {
            const httpTransport = config.transports.find((t) => t.type === "http");
            if (httpTransport) {
                httpTransport.cors = false;
            }
        }
        else if (arg === "--base-path") {
            const value = argv[++i];
            if (value) {
                const httpTransport = config.transports.find((t) => t.type === "http");
                if (httpTransport) {
                    httpTransport.basePath = value;
                }
            }
        }
        else if (arg === "--verbose" || arg === "-v") {
            config.verbose = true;
        }
        else if (arg === "--help" || arg === "-h") {
            printHelp();
            process.exit(0);
        }
        i++;
    }
    // Default to HTTP transport if none specified
    if (config.transports.length === 0) {
        config.transports.push({
            type: "http",
            port: 3000,
            host: "0.0.0.0",
            basePath: "/api",
            cors: true,
        });
    }
    // Apply defaults to transports
    for (const transport of config.transports) {
        if (transport.type === "http") {
            transport.port ??= 3000;
            transport.host ??= "0.0.0.0";
            transport.basePath ??= "/api";
            transport.cors ??= true;
        }
        else if (transport.type === "websocket") {
            transport.port ??= 3001;
            transport.host ??= "0.0.0.0";
            transport.path ??= "/ws";
        }
    }
    return config;
}
function printHelp() {
    console.log(`
server - General procedure server

USAGE:
  server [OPTIONS]

OPTIONS:
  --procedures, -p <pkgs>   Comma-separated procedure packages to load
                            Example: @mark1russell7/client-mongo/register

  --transport, -t <types>   Comma-separated transports: http, websocket, local
                            Default: http

  --port <number>           Port for the primary transport
                            Default: 3000

  --host <address>          Host to bind to
                            Default: 0.0.0.0

  --base-path <path>        Base path for HTTP transport
                            Default: /api

  --cors                    Enable CORS (default)
  --no-cors                 Disable CORS

  --verbose, -v             Verbose output

  --help, -h                Show this help

EXAMPLES:
  # Start MongoDB procedure server
  server --procedures @mark1russell7/client-mongo/register --port 3000

  # Start with multiple procedure packages
  server -p @mark1russell7/client-fs/register,@mark1russell7/client-git/register

  # Start with both HTTP and WebSocket
  server -p @mark1russell7/client-mongo/register -t http,websocket
`);
}
//# sourceMappingURL=config.js.map