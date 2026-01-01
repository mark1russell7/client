/**
 * bundle-mcp - Curated MCP bundle for Claude
 *
 * High-level orchestration tools. Skips low-level fs/git/shell/pnpm
 * since Claude already has shell access.
 */

// Core orchestration
import "@mark1russell7/client-cli";
import "@mark1russell7/client-lib";
import "@mark1russell7/client-procedure";
import "@mark1russell7/client-cue";

// Infrastructure
import "@mark1russell7/client-docker";
import "@mark1russell7/client-snapshot";

// Databases
import "@mark1russell7/client-mongo";
import "@mark1russell7/client-sqlite";
import "@mark1russell7/client-s3";

// Testing
import "@mark1russell7/client-vitest";
import "@mark1russell7/client-test";
