/**
 * bundle-mcp - Curated MCP bundle for Claude
 *
 * High-level orchestration tools. Excludes fs.*, git.*, and pnpm.* (Claude has these via its
 * own shell).
 *
 * NOTE: shell.run/exec/which ARE currently exposed transitively — client-cli, client-docker,
 * and client-test each import client-shell to call shell.run at runtime, which also registers
 * it as an MCP tool. Truly excluding shell needs a register-but-don't-expose mechanism (an MCP
 * tool denylist). See documentation/BUGS-2026-07.md (H18).
 */
import "@mark1russell7/client-cli";
import "@mark1russell7/client-lib";
import "@mark1russell7/client-procedure";
import "@mark1russell7/client-cue";
import "@mark1russell7/client-docker";
import "@mark1russell7/client-snapshot";
import "@mark1russell7/client-mongo";
import "@mark1russell7/client-sqlite";
import "@mark1russell7/client-s3";
import "@mark1russell7/client-vitest";
import "@mark1russell7/client-test";
//# sourceMappingURL=register.d.ts.map