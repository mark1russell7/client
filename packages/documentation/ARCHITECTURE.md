# Mark Ecosystem Architecture

> Comprehensive architecture documentation for the Mark procedure ecosystem.

## Table of Contents

- [System Overview](#system-overview)
- [Package Dependency Graph](#package-dependency-graph)
- [Data Flow](#data-flow)
- [Procedure System](#procedure-system)
- [Transport Layer](#transport-layer)
- [MCP Integration](#mcp-integration)
- [Bundle Composition](#bundle-composition)

---

## System Overview

The Mark ecosystem is organized into **layers** with clear responsibilities:

```mermaid
graph TB
    subgraph "Layer 1: Entry Points"
        CLI[CLI<br/>mark lib new, mark procedure new]
        MCP[MCP Server<br/>impl-mcp-dev]
        HTTP[HTTP Server<br/>server package]
        Direct[Direct Import<br/>Programmatic use]
    end

    subgraph "Layer 2: Bundles"
        BundleDev[bundle-dev<br/>All procedures]
        BundleMCP[bundle-mcp<br/>AI-optimized]
    end

    subgraph "Layer 3: Client Packages"
        ClientFS[client-fs]
        ClientGit[client-git]
        ClientShell[client-shell]
        ClientDocker[client-docker]
        ClientMongo[client-mongo]
        ClientLib[client-lib]
        ClientMore[...]
    end

    subgraph "Layer 4: Core Framework"
        Client[client<br/>RPC + Procedures]
        Cue[cue<br/>Config Gen]
        Logger[logger]
    end

    CLI --> BundleDev
    MCP --> BundleMCP
    HTTP --> BundleDev
    Direct --> ClientFS
    Direct --> ClientGit

    BundleDev --> ClientFS
    BundleDev --> ClientGit
    BundleDev --> ClientShell
    BundleDev --> ClientDocker
    BundleDev --> ClientMongo
    BundleDev --> ClientLib

    BundleMCP --> ClientDocker
    BundleMCP --> ClientMongo
    BundleMCP --> ClientLib

    ClientFS --> Client
    ClientGit --> Client
    ClientShell --> Client
    ClientDocker --> Client
    ClientMongo --> Client
    ClientLib --> Client
    ClientMore --> Client

    Client --> Logger
    ClientLib --> Cue
```

### ASCII Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LAYER 1: ENTRY POINTS                              │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    CLI      │  │ MCP Server  │  │ HTTP Server │  │   Direct    │        │
│  │  mark ...   │  │  (Claude)   │  │  REST API   │  │   Import    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LAYER 2: BUNDLES                                   │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │          bundle-dev             │  │          bundle-mcp             │  │
│  │                                 │  │                                 │  │
│  │  All procedures (100+)          │  │  Curated for AI (50+)          │  │
│  │  • fs, git, shell, pnpm        │  │  • lib, cli, procedure, cue    │  │
│  │  • docker, mongo, sqlite       │  │  • docker, mongo, sqlite       │  │
│  │  • lib, cli, procedure         │  │  • vitest, test, snapshot      │  │
│  └────────────────┬────────────────┘  └────────────────┬────────────────┘  │
└───────────────────┼────────────────────────────────────┼────────────────────┘
                    │                                    │
                    ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 3: CLIENT PACKAGES                              │
│                                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │client-fs│ │client-  │ │client-  │ │client-  │ │client-  │ │client-  │  │
│  │         │ │  git    │ │ shell   │ │ docker  │ │  mongo  │ │  lib    │  │
│  │ fs.read │ │git.clone│ │shell.run│ │docker.ps│ │mongo.*  │ │lib.scan │  │
│  │fs.write │ │git.pull │ │shell.   │ │docker.  │ │         │ │lib.new  │  │
│  │ fs.list │ │git.push │ │  exec   │ │  build  │ │         │ │lib.     │  │
│  │  ...    │ │  ...    │ │  ...    │ │  ...    │ │         │ │ refresh │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       │          │          │          │          │          │           │
│       └──────────┴──────────┴──────────┴──────────┴──────────┘           │
│                                    │                                       │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAYER 4: CORE FRAMEWORK                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        @mark1russell7/client                         │   │
│  │                                                                       │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │ Procedure System│  │   Client Core   │  │   Middleware    │      │   │
│  │  │                 │  │                 │  │                 │      │   │
│  │  │ • Registry      │  │ • Client class  │  │ • Retry         │      │   │
│  │  │ • Definition    │  │ • call()        │  │ • Cache         │      │   │
│  │  │ • Validation    │  │ • stream()      │  │ • Timeout       │      │   │
│  │  │ • Execution     │  │ • exec()        │  │ • Auth          │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  │                                                                       │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │   Transports    │  │   Collections   │  │   Components    │      │   │
│  │  │                 │  │                 │  │                 │      │   │
│  │  │ • HTTP          │  │ • HashMap       │  │ • SSR support   │      │   │
│  │  │ • WebSocket     │  │ • ArrayList     │  │ • Type-safe     │      │   │
│  │  │ • Local         │  │ • PriorityQueue │  │ • Serializable  │      │   │
│  │  │ • Mock          │  │ • LRU/TTL       │  │                 │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │       cue        │  │      logger      │  │    ecosystem     │         │
│  │ Config generation│  │ Structured logs  │  │ Package manifest │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Package Dependency Graph

### Core Dependencies

```mermaid
graph LR
    subgraph "Foundation"
        Logger[logger]
        Cue[cue]
    end

    subgraph "Core"
        Client[client]
    end

    subgraph "Low-Level Clients"
        Shell[client-shell]
        FS[client-fs]
        Git[client-git]
        DAG[client-dag]
    end

    subgraph "High-Level Clients"
        Pnpm[client-pnpm]
        Docker[client-docker]
        Lib[client-lib]
        CLI[client-cli]
    end

    Client --> Logger
    Shell --> Client
    FS --> Client
    Git --> Client
    DAG --> Client

    Pnpm --> Shell
    Docker --> Shell
    CLI --> Shell
    Lib --> Shell
    Lib --> Git
    Lib --> FS
    Lib --> DAG
    Lib --> Pnpm
```

### Full Dependency Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY MATRIX                                    │
├────────────────────┬────────────────────────────────────────────────────────┤
│ Package            │ Depends On                                              │
├────────────────────┼────────────────────────────────────────────────────────┤
│ client             │ logger, ws                                              │
│ cue                │ (standalone)                                            │
│ logger             │ (standalone)                                            │
│ ecosystem          │ (standalone - manifest only)                            │
├────────────────────┼────────────────────────────────────────────────────────┤
│ client-shell       │ client                                                  │
│ client-fs          │ client                                                  │
│ client-git         │ client                                                  │
│ client-dag         │ client                                                  │
├────────────────────┼────────────────────────────────────────────────────────┤
│ client-pnpm        │ client, client-shell                                   │
│ client-docker      │ client, client-shell                                   │
│ client-cli         │ client, client-shell                                   │
│ client-test        │ client, client-shell                                   │
├────────────────────┼────────────────────────────────────────────────────────┤
│ client-lib         │ client, client-shell, client-git, client-fs,           │
│                    │ client-dag, client-pnpm                                │
├────────────────────┼────────────────────────────────────────────────────────┤
│ client-mongo       │ client, mongodb                                        │
│ client-sqlite      │ client, sql.js                                         │
│ client-s3          │ client, @aws-sdk/client-s3                            │
├────────────────────┼────────────────────────────────────────────────────────┤
│ bundle-dev         │ all client-* packages                                  │
│ bundle-mcp         │ curated client-* packages                              │
├────────────────────┼────────────────────────────────────────────────────────┤
│ mcp                │ client, zod                                            │
│ client-mcp         │ client, mcp, @modelcontextprotocol/sdk                │
│ impl-mcp-dev       │ client, client-mcp, bundle-mcp                        │
└────────────────────┴────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Procedure Call Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as Client
    participant Registry as PROCEDURE_REGISTRY
    participant Handler as Procedure Handler
    participant External as External Service

    App->>Client: call(["fs", "read"], { path: "..." })
    Client->>Registry: lookup(["fs", "read"])
    Registry-->>Client: Procedure definition
    Client->>Client: Validate input (Zod)
    Client->>Handler: Execute handler(input, ctx)
    Handler->>External: fs.readFile(path)
    External-->>Handler: file content
    Handler-->>Client: { content: "..." }
    Client->>Client: Validate output (Zod)
    Client-->>App: Result
```

### ASCII Version

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROCEDURE CALL FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Application                Client                Registry              Handler
      │                         │                     │                     │
      │  call(["fs","read"])    │                     │                     │
      │────────────────────────▶│                     │                     │
      │                         │                     │                     │
      │                         │  lookup(path)       │                     │
      │                         │────────────────────▶│                     │
      │                         │                     │                     │
      │                         │◀────────────────────│                     │
      │                         │   Procedure def     │                     │
      │                         │                     │                     │
      │                         │  Validate input     │                     │
      │                         │◀─────────┐          │                     │
      │                         │          │          │                     │
      │                         │──────────┘          │                     │
      │                         │                     │                     │
      │                         │  Execute handler    │                     │
      │                         │────────────────────────────────────────────▶
      │                         │                     │                     │
      │                         │◀────────────────────────────────────────────
      │                         │   Result            │                     │
      │                         │                     │                     │
      │                         │  Validate output    │                     │
      │                         │◀─────────┐          │                     │
      │                         │          │          │                     │
      │                         │──────────┘          │                     │
      │                         │                     │                     │
      │◀────────────────────────│                     │                     │
      │   Typed result          │                     │                     │
      │                         │                     │                     │
```

---

## Procedure System

### Procedure Definition

```mermaid
graph TB
    subgraph "Procedure Definition"
        Path[path: string[]]
        Input[input: ZodSchema]
        Output[output: ZodSchema]
        Handler[handler: Function]
        Meta[metadata: Object]
    end

    subgraph "Registration"
        Registry[PROCEDURE_REGISTRY]
        AutoReg[Auto-registration<br/>via import]
    end

    subgraph "Execution"
        Client[Client.call()]
        Validation[Schema Validation]
        Execution[Handler Execution]
    end

    Path --> Registry
    Input --> Registry
    Output --> Registry
    Handler --> Registry
    Meta --> Registry
    AutoReg --> Registry

    Registry --> Client
    Client --> Validation
    Validation --> Execution
```

### Procedure Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROCEDURE LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. DEFINITION
   ┌────────────────────────────────────────────────────────────────────────┐
   │  const readFile = createProcedure()                                    │
   │    .path(["fs", "read"])                                               │
   │    .input(z.object({ path: z.string() }))                              │
   │    .output(z.object({ content: z.string() }))                          │
   │    .handler(async (input) => { ... })                                  │
   │    .build();                                                           │
   └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. REGISTRATION
   ┌────────────────────────────────────────────────────────────────────────┐
   │  registerProcedures([readFile]);                                       │
   │  // or auto-register via import side-effect                            │
   │  import "@mark1russell7/client-fs/register.js";                       │
   └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. DISCOVERY
   ┌────────────────────────────────────────────────────────────────────────┐
   │  PROCEDURE_REGISTRY.list() → [{ path: ["fs", "read"], ... }, ...]     │
   │  PROCEDURE_REGISTRY.get(["fs", "read"]) → Procedure                   │
   └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
4. EXECUTION
   ┌────────────────────────────────────────────────────────────────────────┐
   │  const result = await client.call(["fs", "read"], { path: "/etc" });  │
   │  // Input validated → Handler executed → Output validated → Returned   │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## Transport Layer

### Transport Architecture

```mermaid
graph TB
    subgraph "Client Side"
        Client[Client]
        MW[Middleware Chain]
    end

    subgraph "Transports"
        HTTP[HTTP Transport]
        WS[WebSocket Transport]
        Local[Local Transport]
        MCP[MCP Transport]
    end

    subgraph "Server Side"
        Server[Server]
        Handler[Handlers]
    end

    Client --> MW
    MW --> HTTP
    MW --> WS
    MW --> Local
    MW --> MCP

    HTTP --> Server
    WS --> Server
    Local --> Server

    Server --> Handler
```

### Transport Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSPORT COMPARISON                                  │
├─────────────┬───────────┬───────────┬───────────┬───────────────────────────┤
│ Transport   │ Protocol  │ Streaming │ Use Case  │ Notes                      │
├─────────────┼───────────┼───────────┼───────────┼───────────────────────────┤
│ HTTP        │ HTTP/1.1  │ No        │ REST API  │ Standard request/response │
│ WebSocket   │ WS        │ Yes       │ Real-time │ Bidirectional streaming   │
│ Local       │ In-process│ Yes       │ Testing   │ No network overhead       │
│ MCP (stdio) │ stdio     │ No        │ Claude    │ Model Context Protocol    │
└─────────────┴───────────┴───────────┴───────────┴───────────────────────────┘
```

---

## MCP Integration

### MCP Architecture

```mermaid
graph TB
    subgraph "Claude Desktop/Code"
        Claude[Claude AI]
    end

    subgraph "MCP Protocol"
        Stdio[stdio transport]
    end

    subgraph "impl-mcp-dev"
        Server[MCP Server]
        Convert[proceduresToMcpTools]
    end

    subgraph "Procedure Registry"
        Registry[PROCEDURE_REGISTRY]
        Procs[Registered Procedures]
    end

    subgraph "Bundles"
        Bundle[bundle-mcp]
        Clients[client-*]
    end

    Claude <-->|MCP Protocol| Stdio
    Stdio <--> Server
    Server --> Convert
    Convert --> Registry
    Registry --> Procs
    Bundle --> Clients
    Clients --> Procs
```

### MCP Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MCP FLOW                                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. STARTUP
   ┌────────────────────────────────────────────────────────────────────────┐
   │  Claude starts MCP server via stdio                                    │
   │                                                                         │
   │  claude_desktop_config.json:                                           │
   │  {                                                                      │
   │    "mcpServers": {                                                      │
   │      "dev-tools": {                                                     │
   │        "command": "node",                                               │
   │        "args": ["/path/to/impl-mcp-dev/dist/server.js"]               │
   │      }                                                                  │
   │    }                                                                    │
   │  }                                                                      │
   └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. TOOL DISCOVERY
   ┌────────────────────────────────────────────────────────────────────────┐
   │  Claude → ListToolsRequest                                             │
   │                                                                         │
   │  Server:                                                                │
   │  1. import "@mark1russell7/bundle-mcp/register.js"                    │
   │  2. procedures = PROCEDURE_REGISTRY.list()                             │
   │  3. tools = proceduresToMcpTools(procedures)                           │
   │                                                                         │
   │  Server → ListToolsResponse: [{ name: "docker.ps", ... }, ...]        │
   └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. TOOL EXECUTION
   ┌────────────────────────────────────────────────────────────────────────┐
   │  Claude → CallToolRequest: { name: "docker.ps", arguments: {} }       │
   │                                                                         │
   │  Server:                                                                │
   │  1. procedure = PROCEDURE_REGISTRY.get(["docker", "ps"])              │
   │  2. result = await procedure.handler({}, ctx)                          │
   │                                                                         │
   │  Server → CallToolResponse: { content: [{ type: "text", ... }] }      │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## Bundle Composition

### Bundle Architecture

```mermaid
graph LR
    subgraph "bundle-dev (Full)"
        Dev_FS[client-fs]
        Dev_Git[client-git]
        Dev_Shell[client-shell]
        Dev_Pnpm[client-pnpm]
        Dev_Docker[client-docker]
        Dev_Mongo[client-mongo]
        Dev_Lib[client-lib]
        Dev_More[...]
    end

    subgraph "bundle-mcp (Curated)"
        MCP_Docker[client-docker]
        MCP_Mongo[client-mongo]
        MCP_Lib[client-lib]
        MCP_CLI[client-cli]
        MCP_More[...]
    end

    style Dev_FS fill:#f97316,color:#fff
    style Dev_Git fill:#f97316,color:#fff
    style Dev_Shell fill:#f97316,color:#fff
    style Dev_Pnpm fill:#f97316,color:#fff
```

### Bundle Comparison Table

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BUNDLE COMPARISON                                     │
├─────────────────────────────────┬─────────────────────┬─────────────────────┤
│ Package Category                │ bundle-dev          │ bundle-mcp          │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Low-level FS/Git/Shell/PNPM     │ ✓ Included          │ ✗ Excluded          │
│ (fs.*, git.*, shell.*, pnpm.*)  │                     │ (Claude has shell)  │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Ecosystem Management            │ ✓ Included          │ ✓ Included          │
│ (lib.*, cli.*, procedure.*)     │                     │                     │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Infrastructure                  │ ✓ Included          │ ✓ Included          │
│ (docker.*, snapshot.*)          │                     │                     │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Databases                       │ ✓ Included          │ ✓ Included          │
│ (mongo.*, db.*, s3.*)           │                     │                     │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Testing                         │ ✓ Included          │ ✓ Included          │
│ (vitest.*, test.*)              │                     │                     │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Total Procedures                │ ~100+               │ ~50+                │
├─────────────────────────────────┼─────────────────────┼─────────────────────┤
│ Primary Use Case                │ CLI / Development   │ MCP / AI Integration│
└─────────────────────────────────┴─────────────────────┴─────────────────────┘
```

---

## See Also

- [README](./README.md) - Ecosystem overview
- [Procedures](./PROCEDURES.md) - Complete procedure catalog
- [Onboarding](./ONBOARDING.md) - Getting started guide
- [Packages](./PACKAGES.md) - Detailed package descriptions
