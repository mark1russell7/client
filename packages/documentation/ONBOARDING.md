# Mark Ecosystem Onboarding Guide

> Step-by-step guide for first-time users to install, configure, and use the Mark ecosystem.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Options](#installation-options)
- [Option A: Full Ecosystem Install](#option-a-full-ecosystem-install)
- [Option B: Single Package Install](#option-b-single-package-install)
- [Option C: MCP Integration Only](#option-c-mcp-integration-only)
- [Using the CLI](#using-the-cli)
- [Using with Claude](#using-with-claude)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- **Node.js** >= 20 (LTS recommended)
- **pnpm** >= 8.0 (recommended) or npm >= 9.0
- **Git** >= 2.30

### Optional (for specific features)

- **Docker** - For docker.* procedures and docker-* packages
- **MongoDB** - For mongo.* procedures (or use docker-mongo)
- **Claude Desktop/Code** - For MCP integration

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should be >= 20

# Check pnpm version
pnpm --version  # Should be >= 8

# Check Git version
git --version   # Should be >= 2.30
```

---

## Installation Options

Choose the option that fits your use case:

| Option | Use Case | Time |
|--------|----------|------|
| **A: Full Ecosystem** | Develop ecosystem packages, contribute | ~10 min |
| **B: Single Package** | Use specific procedures in your project | ~2 min |
| **C: MCP Integration** | Use with Claude Desktop/Code | ~5 min |

---

## Option A: Full Ecosystem Install

For developers who want to work with the entire ecosystem.

### Step 1: Create Base Directory

```bash
mkdir -p ~/git
cd ~/git
```

### Step 2: Clone Core Packages

```bash
# Clone ecosystem manifest
git clone https://github.com/mark1russell7/ecosystem.git

# Clone CLI
git clone https://github.com/mark1russell7/cli.git

# Clone core client
git clone https://github.com/mark1russell7/client.git
```

### Step 3: Build CLI

```bash
cd ~/git/cli
pnpm install
pnpm build
```

### Step 4: Install All Packages

```bash
# This clones and builds all 40+ packages in dependency order
node ~/git/cli/dist/index.js lib install
```

This command:
1. Reads `ecosystem.manifest.json`
2. Clones missing packages from GitHub
3. Builds packages in topological order (respecting dependencies)
4. Takes ~5-10 minutes on first run

### Step 5: Verify Installation

```bash
# List all installed packages
node ~/git/cli/dist/index.js lib scan

# Expected output: List of 40+ packages with their paths
```

### Directory Structure After Install

```
~/git/
├── ecosystem/          # Ecosystem manifest
├── cli/                # CLI tool
├── client/             # Core RPC framework
├── cue/                # Config generation
├── logger/             # Structured logging
├── client-fs/          # File system procedures
├── client-git/         # Git procedures
├── client-shell/       # Shell procedures
├── client-docker/      # Docker procedures
├── client-mongo/       # MongoDB procedures
├── client-lib/         # Ecosystem management
├── bundle-dev/         # Full procedure bundle
├── bundle-mcp/         # MCP-optimized bundle
├── impl-mcp-dev/       # MCP server
└── ... (30+ more)
```

---

## Option B: Single Package Install

For using specific procedures in your own project.

### Install a Client Package

```bash
# In your project directory
npm install github:mark1russell7/client#main
npm install github:mark1russell7/client-fs#main
```

### Use in Your Code

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-fs/register.js";

const client = new Client({ /* transport config */ });

// Now you can use fs.* procedures
const result = await client.call(["fs", "read"], { path: "/etc/hosts" });
console.log(result.content);
```

### Available Packages

See [PACKAGES.md](./PACKAGES.md) for complete list.

---

## Option C: MCP Integration Only

For using the ecosystem with Claude Desktop or Claude Code.

### Step 1: Clone Required Packages

```bash
mkdir -p ~/git
cd ~/git

# Clone the MCP server
git clone https://github.com/mark1russell7/impl-mcp-dev.git

# Clone bundle-mcp (will pull dependencies)
git clone https://github.com/mark1russell7/bundle-mcp.git
```

### Step 2: Install and Build

```bash
cd ~/git/impl-mcp-dev
pnpm install
pnpm build
```

### Step 3: Configure Claude Desktop

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dev-tools": {
      "command": "node",
      "args": ["C:/Users/YOUR_USERNAME/git/impl-mcp-dev/dist/server.js"],
      "env": {
        "MCP_BUNDLES": "@mark1russell7/bundle-mcp"
      }
    }
  }
}
```

Replace `YOUR_USERNAME` with your actual username. Use forward slashes even on Windows.

### Step 4: Configure Claude Code

Add to `~/.claude.json`:

```json
{
  "projects": {
    "C:/Users/YOUR_USERNAME/git": {
      "mcpServers": {
        "dev-tools": {
          "type": "stdio",
          "command": "node",
          "args": ["C:/Users/YOUR_USERNAME/git/impl-mcp-dev/dist/server.js"],
          "env": {
            "MCP_BUNDLES": "@mark1russell7/bundle-mcp",
            "MONGODB_URI": "mongodb://localhost:27017"
          }
        }
      }
    }
  }
}
```

### Step 5: Restart Claude

- **Claude Desktop**: Quit and reopen
- **Claude Code**: Run `/mcp` to see connected servers

### Step 6: Verify Connection

In Claude, you should see the MCP tools available. Try:
- Ask Claude to "list docker containers" (uses `docker.ps`)
- Ask Claude to "run vitest" (uses `vitest.run`)

---

## Using the CLI

### Basic Commands

```bash
# Alias for convenience (add to ~/.bashrc or ~/.zshrc)
alias mark="node ~/git/cli/dist/index.js"

# Scan ecosystem
mark lib scan

# Create new package
mark lib new my-package

# Refresh package (install + build)
mark lib refresh

# Refresh all packages
mark lib refresh --all

# Create new procedure
mark procedure new my-package fs.custom
```

### Common Workflows

#### Create a New Package

```bash
# Create package with standard template
mark lib new my-new-package

# This creates:
# ~/git/my-new-package/
# ├── src/
# │   └── index.ts
# ├── package.json
# ├── tsconfig.json
# └── dependencies.json
```

#### Add a Procedure to Your Package

```bash
# Create fs.custom procedure in my-new-package
mark procedure new my-new-package fs.custom

# This creates:
# ~/git/my-new-package/src/procedures/fs/custom.ts
# ~/git/my-new-package/src/procedures/fs/index.ts
# ~/git/my-new-package/src/register.ts
```

#### Build and Test Changes

```bash
# Build single package
cd ~/git/my-new-package
pnpm build

# Or use refresh (install + build)
mark lib refresh

# Build all packages
mark lib refresh --all
```

---

## Using with Claude

### Available Tools via MCP

When using `bundle-mcp`, Claude has access to:

| Tool | Description | Example Use |
|------|-------------|-------------|
| `docker.ps` | List containers | "List running Docker containers" |
| `docker.logs` | Get container logs | "Show logs for container xyz" |
| `mongo.documents.find` | Query MongoDB | "Find all users in the database" |
| `vitest.run` | Run tests | "Run the tests" |
| `lib.scan` | List packages | "What packages are in the ecosystem?" |
| `lib.refresh` | Rebuild packages | "Rebuild all packages" |

### Example Conversations

**Running Tests:**
```
You: Run the tests for client-fs
Claude: [Uses vitest.run tool with cwd: ~/git/client-fs]
```

**Database Query:**
```
You: Find all documents in the users collection
Claude: [Uses mongo.documents.find tool with collection: "users"]
```

**Docker Management:**
```
You: Start the MongoDB container
Claude: [Uses docker.compose.up tool]
```

---

## Troubleshooting

### Common Issues

#### "Module not found" Error

```bash
# Ensure package is built
cd ~/git/PACKAGE_NAME
pnpm build

# Or rebuild all
node ~/git/cli/dist/index.js lib refresh --all
```

#### "Procedure not found: shell.exec"

Some packages depend on `client-shell`. Ensure it's imported:

```typescript
// In your register.ts
import "@mark1russell7/client-shell";  // Must be first!
import { registerProcedures } from "@mark1russell7/client";
// ... rest of imports
```

#### MCP Server Not Connecting

1. Check path in config uses forward slashes
2. Ensure impl-mcp-dev is built: `cd ~/git/impl-mcp-dev && pnpm build`
3. Check Claude Code with `/mcp` command
4. Restart Claude after config changes

#### pnpm Install Errors

```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### Git Clone Authentication

Ensure SSH keys are configured for GitHub:
```bash
ssh -T git@github.com
# Should show: "Hi username! You've successfully authenticated..."
```

### Getting Help

- Check individual package READMEs for specific issues
- Open issues at: https://github.com/mark1russell7/ecosystem/issues

---

## Next Steps

After installation:

1. **Explore Procedures**: See [PROCEDURES.md](./PROCEDURES.md) for complete catalog
2. **Understand Architecture**: Read [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Create Your Own Packages**: Use `mark lib new` and `mark procedure new`
4. **Contribute**: Submit PRs to improve documentation or add features

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUICK REFERENCE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ INSTALL ECOSYSTEM                                                           │
│   cd ~/git && git clone https://github.com/mark1russell7/cli.git           │
│   cd cli && pnpm install && pnpm build                                      │
│   node dist/index.js lib install                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ CREATE PACKAGE                                                               │
│   node ~/git/cli/dist/index.js lib new PACKAGE_NAME                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ CREATE PROCEDURE                                                             │
│   node ~/git/cli/dist/index.js procedure new PACKAGE fs.myproc             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BUILD ALL                                                                    │
│   node ~/git/cli/dist/index.js lib refresh --all                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ MCP CONFIG (Claude Desktop)                                                  │
│   %APPDATA%\Claude\claude_desktop_config.json (Windows)                     │
│   ~/Library/Application Support/Claude/... (macOS)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ MCP CONFIG (Claude Code)                                                     │
│   ~/.claude.json                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
