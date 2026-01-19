# @mark1russell7/client-dag

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

> Generic DAG (Directed Acyclic Graph) utilities for dependency ordering and parallel execution. Powers the ecosystem's build system.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [Types](#types)
  - [Functions](#functions)
  - [buildDAG](#builddag)
  - [executeDAG](#executedag)
- [Use Cases](#use-cases)
- [Integration](#integration)
- [Requirements](#requirements)
- [License](#license)

---

## Overview

**client-dag** provides utilities for working with Directed Acyclic Graphs:

- **DAG Building** - Topological sorting using Kahn's algorithm
- **Parallel Execution** - Process nodes level-by-level with configurable concurrency
- **Traversal Utilities** - Find roots, leaves, dependents, and dependencies
- **Progress Tracking** - Callbacks for node start/complete events

---

## Installation

```bash
npm install github:mark1russell7/client-dag#main
```

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "Input"
        Nodes[DAGNode Array<br/>id + dependencies]
    end

    subgraph "client-dag"
        subgraph "DAG Builder"
            Kahn[Kahn's Algorithm]
            Topo[Topological Sort]
            Level[Level Assignment]
        end

        subgraph "DAG Executor"
            Queue[Level Queue]
            Pool[Concurrency Pool]
            Process[Node Processor]
        end

        subgraph "Traversal"
            Roots[getRoots]
            Leaves[getLeaves]
            Deps[getDependents]
            Reqs[getDependencies]
        end
    end

    subgraph "Output"
        DAG[DependencyDAG<br/>nodes + levels]
        Result[DAGResult<br/>success + results]
    end

    Nodes --> Kahn
    Kahn --> Topo
    Topo --> Level
    Level --> DAG

    DAG --> Queue
    Queue --> Pool
    Pool --> Process
    Process --> Result

    DAG --> Roots
    DAG --> Leaves
    DAG --> Deps
    DAG --> Reqs
```

### Execution Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant DAG as client-dag
    participant Build as buildDAG
    participant Exec as executeDAG
    participant Proc as NodeProcessor

    App->>Build: buildDAG(nodes)
    Build->>Build: Kahn's algorithm
    Build->>Build: Assign levels
    Build-->>App: DependencyDAG

    App->>Exec: executeDAG(dag, processor, options)

    loop For each level
        Exec->>Exec: Get nodes at level
        par Parallel execution (concurrency)
            Exec->>Proc: process(node1)
            Proc-->>Exec: NodeResult
            Exec->>Proc: process(node2)
            Proc-->>Exec: NodeResult
        end
        Exec->>Exec: Check failFast
    end

    Exec-->>App: DAGResult
```

### Topological Sorting (Kahn's Algorithm)

```mermaid
graph LR
    subgraph "Input Graph"
        A1[A depends on B,C]
        B1[B depends on D]
        C1[C depends on D]
        D1[D no deps]
    end

    subgraph "Processing"
        K[Kahn's Algorithm]
    end

    subgraph "Output Levels"
        L0[Level 0: D]
        L1[Level 1: B, C]
        L2[Level 2: A]
    end

    A1 --> K
    B1 --> K
    C1 --> K
    D1 --> K
    K --> L0
    K --> L1
    K --> L2
```

### DAG Structure Visualization

```mermaid
graph TB
    subgraph "Level 2 (Roots)"
        App[app]
    end

    subgraph "Level 1"
        LibA[lib-a]
        LibB[lib-b]
        LibC[lib-c]
    end

    subgraph "Level 0 (Leaves)"
        Core[core]
    end

    App --> LibA
    App --> LibB
    App --> LibC
    LibA --> Core
    LibB --> Core
    LibC --> Core

    style App fill:#f9f,stroke:#333
    style Core fill:#9f9,stroke:#333
```

---

## Quick Start

```typescript
import {
  buildDAG,
  executeDAG,
  type DAGNode,
  type NodeProcessor,
} from "@mark1russell7/client-dag";

// Define nodes
const nodes: DAGNode[] = [
  { id: "app", dependencies: ["lib-a", "lib-b"] },
  { id: "lib-a", dependencies: ["core"] },
  { id: "lib-b", dependencies: ["core"] },
  { id: "core", dependencies: [] },
];

// Build the DAG
const dag = buildDAG(nodes);
// Levels: [["core"], ["lib-a", "lib-b"], ["app"]]

// Define a processor
const processor: NodeProcessor = async (node) => {
  console.log(`Processing ${node.id}`);
  // Do work...
  return {
    node,
    success: true,
    duration: 100,
    logs: [`Built ${node.id}`],
  };
};

// Execute with parallel processing per level
const result = await executeDAG(dag, processor, {
  concurrency: 4,
  failFast: true,
  onNodeStart: (node) => console.log(`Starting: ${node.id}`),
  onNodeComplete: (result) => console.log(`Done: ${result.node.id}`),
});
```

---

## API Reference

### Types

```typescript
interface DAGNode<TData = unknown> {
  id: string;                    // Unique identifier
  dependencies: string[];        // IDs of dependencies
  level?: number;                // Topological level (computed)
  data?: TData;                  // Optional user data
}

interface DependencyDAG<TNode extends DAGNode = DAGNode> {
  nodes: Map<string, TNode>;     // All nodes
  levels: TNode[][];             // Nodes by level
  roots: string[];               // No dependents (end nodes)
  leaves: string[];              // No dependencies (start nodes)
}

interface DAGExecutionOptions<TNode extends DAGNode = DAGNode> {
  concurrency?: number;          // Max parallel per level (default: 4)
  failFast?: boolean;            // Stop on first error (default: true)
  onNodeStart?: (node: TNode) => void;
  onNodeComplete?: (result: NodeResult<TNode>) => void;
}

interface NodeResult<TNode extends DAGNode = DAGNode> {
  node: TNode;
  success: boolean;
  error?: Error;
  duration: number;              // ms
  logs: string[];
  output?: unknown;
}

interface DAGResult<TNode extends DAGNode = DAGNode> {
  success: boolean;
  results: Map<string, NodeResult<TNode>>;
  failedNodes: string[];
  totalDuration: number;
}

type NodeProcessor<TNode extends DAGNode = DAGNode> = (
  node: TNode
) => Promise<NodeResult<TNode>>;
```

### Functions

| Function | Description |
|----------|-------------|
| `buildDAG(nodes)` | Build a DAG from nodes with dependencies |
| `executeDAG(dag, processor, options)` | Execute DAG with parallel processing |
| `getRoots(dag)` | Get nodes with no dependents |
| `getLeaves(dag)` | Get nodes with no dependencies |
| `getDependents(dag, id)` | Get nodes that depend on this node |
| `getDependencies(dag, id)` | Get this node's dependencies |

---

### buildDAG

Build a leveled DAG using Kahn's algorithm.

```typescript
import { buildDAG } from "@mark1russell7/client-dag";

const nodes = [
  { id: "a", dependencies: ["b", "c"] },
  { id: "b", dependencies: ["d"] },
  { id: "c", dependencies: ["d"] },
  { id: "d", dependencies: [] },
];

const dag = buildDAG(nodes);
// dag.levels = [
//   [{ id: "d", ... }],      // Level 0: process first
//   [{ id: "b" }, { id: "c" }], // Level 1: parallel
//   [{ id: "a", ... }],      // Level 2: process last
// ]
```

**Cycle Detection:**
```typescript
// Throws if cycles detected
const cyclic = [
  { id: "a", dependencies: ["b"] },
  { id: "b", dependencies: ["a"] }, // Cycle!
];
buildDAG(cyclic); // Error: Cycle detected
```

---

### executeDAG

Execute nodes level by level with configurable parallelism.

```typescript
import { executeDAG } from "@mark1russell7/client-dag";

const result = await executeDAG(dag, processor, {
  concurrency: 4,        // Process up to 4 nodes in parallel per level
  failFast: true,        // Stop immediately on first failure
  onNodeStart: (node) => console.log(`Starting: ${node.id}`),
  onNodeComplete: (r) => console.log(`${r.node.id}: ${r.success ? "OK" : "FAIL"}`),
});

if (result.success) {
  console.log("All nodes processed successfully");
} else {
  console.log("Failed nodes:", result.failedNodes);
}
```

**Execution Order:**

```mermaid
graph LR
    subgraph "Level 0"
        D[core]
    end

    subgraph "Level 1 (parallel)"
        B[lib-a]
        C[lib-b]
    end

    subgraph "Level 2"
        A[app]
    end

    D -->|then| B
    D -->|then| C
    B -->|then| A
    C -->|then| A
```

---

## Use Cases

### Package Build Order

Build packages in dependency order (used by `lib.refresh`):

```typescript
const packages = [
  { id: "app", dependencies: ["@org/lib-ui", "@org/lib-core"] },
  { id: "@org/lib-ui", dependencies: ["@org/lib-core"] },
  { id: "@org/lib-core", dependencies: [] },
];

const dag = buildDAG(packages);
await executeDAG(dag, async (pkg) => {
  await runBuild(pkg.id);
  return { node: pkg, success: true, duration: 0, logs: [] };
});
```

### Task Scheduling

Execute dependent tasks:

```typescript
const tasks = [
  { id: "deploy", dependencies: ["test", "build"] },
  { id: "test", dependencies: ["build"] },
  { id: "build", dependencies: [] },
];

const dag = buildDAG(tasks);
await executeDAG(dag, async (task) => {
  await runTask(task.id);
  return { node: task, success: true, duration: 0, logs: [] };
});
```

### Module Loading

Load modules respecting dependencies:

```typescript
const modules = [
  { id: "app", dependencies: ["router", "store"] },
  { id: "router", dependencies: ["utils"] },
  { id: "store", dependencies: ["utils"] },
  { id: "utils", dependencies: [] },
];

const dag = buildDAG(modules);
await executeDAG(dag, async (mod) => {
  await import(mod.id);
  return { node: mod, success: true, duration: 0, logs: [] };
});
```

---

## Integration

### With client-lib

`client-lib` uses `client-dag` for ecosystem package management:

```mermaid
graph TB
    subgraph "client-lib"
        Scan[lib.scan<br/>Discover packages]
        Refresh[lib.refresh<br/>Build all]
    end

    subgraph "client-dag"
        Build[buildDAG]
        Execute[executeDAG]
    end

    subgraph "Packages"
        P1[Package A]
        P2[Package B]
        P3[Package C]
    end

    Scan --> Build
    Build --> Execute
    Refresh --> Execute
    Execute --> P1
    Execute --> P2
    Execute --> P3
```

### dag.traverse Procedure

The `dag.traverse` procedure in `client-lib` wraps this functionality:

```typescript
// Via procedure
await client.call(["dag", "traverse"], {
  visit: ["pnpm", "install"],
  concurrency: 4,
});

// Internally uses
const dag = buildDAG(packages);
await executeDAG(dag, processor);
```

---

## Requirements

- **Node.js** >= 20
- **Dependencies:**
  - `@mark1russell7/client`

---

## License

MIT
