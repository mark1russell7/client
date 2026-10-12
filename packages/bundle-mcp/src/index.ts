/**
 * @procedures/bundle-mcp
 *
 * Importing the package registers the procedures of the bundle, as the root of every other client
 * package does (docs review DOC-6: before, the root was empty, and only
 * `@procedures/bundle-mcp/register.js` registered them). The lists of the MCP tool surface
 * come with it.
 */

export { mcpNamespaces, mcpExclude, bundleMcpModules, bundleMcpModule } from "./register.js";
