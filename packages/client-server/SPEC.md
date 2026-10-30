# Client-Server Ecosystem Specification

## Executive Summary

A bidirectional RPC system where peers can call each other's procedures with full TypeScript autocomplete at compile time. The system enables:

1. **Server → Client**: Server calls render procedures on browser clients (SSR)
2. **Client → Server**: Browser calls data procedures on server (MongoDB, etc.)
3. **Compile-time Types**: Full autocomplete for remote procedure paths, inputs, and outputs

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SPLAY (Core)                                   │
│  - inferType(data) → "string" | "array" | "object" | ...                   │
│  - dispatch(data, size, path, config) → recursive rendering                │
│  - Registry<Output> → maps types to factories                              │
│  - ComponentOutput interface (serializable)                                │
│  - Layout helpers (gridLayout, listLayout)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│    splay-react      │  │    client-splay     │  │   client-server     │
│                     │  │                     │  │                     │
│ - primitiveComps    │  │ - createClient      │  │ - server.create     │
│   (return CompOut)  │  │   Registry(call)    │  │ - server.connect    │
│ - hydrate layer     │  │ - createReactHydrate│  │ - discovery protocol│
│   (CompOut→React)   │  │ - typed RPC bridge  │  │ - manifest.generate │
│ - Viewer component  │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ client-splay-react  │  │   client-mongo      │  │     minimongo       │
│     (PLANNED)       │  │                     │  │                     │
│                     │  │ - MongoProcedures   │  │ - Bridge registry   │
│ - Register splay-   │  │   typed interface   │  │ - Remote procedure  │
│   react primitives  │  │ - 19 MongoDB procs  │  │   calls via bridge  │
│   as procedures     │  │ - Full autocomplete │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## Package Responsibilities

### 1. `@mark1russell7/splay` (Core Rendering Logic)

**Location**: `~/git/splay`

**Purpose**: Framework-agnostic recursive rendering engine.

**Key Exports**:
```typescript
// Types
export interface ComponentOutput {
  type: string;
  props: Record<string, unknown>;
  children?: ComponentOutput[];
  key?: string | number;
}

export interface RenderContext<T = unknown> {
  data: T;
  size: Size;
  path: string;
  depth: number;
  render: (data: unknown, size: Size, path: string) => unknown;
}

// Functions
export function inferType(value: unknown): DataType;
export function dispatch<Output>(data, size, path, config): Output;
export function createRegistry<Output>(): Registry<Output>;

// Layout helpers
export function gridLayout(size, count, columns, rowHeight): LayoutItem[];
export function listLayout(size, count, rowHeight): LayoutItem[];
```

**Status**: ✅ Complete (added ComponentOutput type)

---

### 2. `@mark1russell7/splay-react` (React Rendering)

**Location**: `~/git/splay-react`

**Purpose**: React adapter for splay. Components return `ComponentOutput`, hydration converts to React.

**Architecture** (REFACTORED):
```
components.ts  →  ComponentOutput (serializable)
     ↓
hydrate.tsx    →  React elements (for browser)
     ↓
Viewer.tsx     →  React component (dispatch + hydrate)
```

**Key Exports**:
```typescript
// Components (return ComponentOutput)
export const stringComponent = (ctx: RenderContext): ComponentOutput;
export const numberComponent = (ctx: RenderContext): ComponentOutput;
export const arrayComponent = (ctx: RenderContext): ComponentOutput;
export const objectComponent = (ctx: RenderContext): ComponentOutput;
export function registerComponents(registry: Registry<ComponentOutput>): void;

// Hydration (ComponentOutput → React)
export function createHydrate(components: HydrationMap): (output: ComponentOutput) => ReactNode;
export const hydrate: (output: ComponentOutput) => ReactNode;
export const defaultHydrationMap: HydrationMap;

// Viewer (combined)
export const Viewer: React.FC<ViewerProps>;
export function render(data, size, path, registry?): ComponentOutput;
```

**Status**: 🔄 Refactored (primitives.tsx → components.ts + hydrate.tsx)

**Files Changed**:
- `src/components.ts` - NEW: Primitives returning ComponentOutput
- `src/hydrate.tsx` - NEW: React hydration layer
- `src/Viewer.tsx` - UPDATED: Uses new architecture
- `src/index.ts` - UPDATED: New exports
- `src/primitives.tsx` - DELETED: Replaced by above

---

### 3. `@procedures/splay` (Procedure Bridge)

**Location**: `packages/client-splay`

**Purpose**: Bridge between splay rendering and client procedure system.

**Key Exports**:
```typescript
// Registry that calls remote procedures
export function createClientRegistry(call: ProcedureCaller, options?): Registry;

// Hydration
export function createReactHydrate(React, options): (descriptor: ComponentOutput) => ReactNode;

// Component definition helpers (since roadmap 3.4 in this package). They register nothing.
export { defineComponent, simpleComponent, streamingComponent, componentModule } from "./components/index.js";
```

**Status**: ✅ Exists (may need updates after splay-react refactor)

---

### 4. `@mark1russell7/client-splay-react` (PLANNED)

**Location**: `~/git/client-splay-react` (TO CREATE)

**Purpose**: Register splay-react primitives as callable procedures.

**Planned Exports**:
```typescript
// Register all primitive components as procedures
export function registerPrimitivesProcedures(): void;

// Register hydration mappings as procedures (for discovery)
export function registerHydrationProcedures(): void;

// Typed interface for autocomplete
export interface SplayReactProcedures {
  components: {
    string: { input: ComponentInput; output: ComponentOutput };
    number: { input: ComponentInput; output: ComponentOutput };
    array: { input: ComponentInput; output: ComponentOutput };
    object: { input: ComponentInput; output: ComponentOutput };
    // ...
  };
}
```

**Status**: ❌ Not created yet

---

### 5. `@procedures/peer` (Peer System)

**Location**: `packages/client-server`

**Purpose**: Transport-agnostic peer that exposes procedures and enables bidirectional RPC.

**Implemented Procedures**:

| Path | Description | Status |
|------|-------------|--------|
| `["server", "create"]` | Create server with HTTP/WS transports | ✅ |
| `["server", "connect"]` | Connect to remote peer | ✅ |
| `["server", "disconnect"]` | Disconnect from peer | ✅ |
| `["_discovery", "announce"]` | Exchange procedure manifests | ✅ |
| `["manifest", "generate"]` | Generate .d.ts and JSON manifests | ✅ |

**Package Structure**:
```
client-server/
├── src/
│   ├── index.ts
│   ├── types.ts              # Zod schemas
│   ├── register.ts           # Procedure registration
│   ├── connection/
│   │   └── index.ts          # Peer connection management
│   ├── discovery/
│   │   └── index.ts          # Discovery protocol
│   ├── procedures/
│   │   ├── server.create.ts
│   │   ├── server.connect.ts
│   │   ├── server.disconnect.ts
│   │   └── manifest.generate.ts
│   └── manifest/
│       ├── typescript.ts     # .d.ts generation
│       ├── json.ts           # JSON manifest
│       └── index.ts
```

**Status**: Phase 1-3 complete. Bidirectional RPC came with roadmap R24 (`b2a3e3a`), and remote events with `EVENTS.md`.

---

### 6. `@procedures/mongo` (MongoDB Procedures)

**Location**: `packages/client-mongo`

**Purpose**: MongoDB procedures with typed interface for autocomplete.

**Key Addition** (this session):
```typescript
// procedures.types.ts - NEW
export interface MongoProcedures {
  mongo: {
    database: {
      ping: { input: PingInput; output: PingOutput };
      info: { input: InfoInput; output: DatabaseInfo };
    };
    collections: {
      list: { input: ListCollectionsInput; output: ListCollectionsOutput };
      create: { input: CreateCollectionInput; output: CreateCollectionOutput };
      // ...
    };
    documents: {
      find: { input: FindInput; output: FindOutput };
      get: { input: GetInput; output: GetOutput };
      insert: { input: InsertInput; output: InsertOutput };
      // ...
    };
    indexes: { /* ... */ };
  };
}

export type ProcedureInput<P extends readonly string[]> = /* mapped type */;
export type ProcedureOutput<P extends readonly string[]> = /* mapped type */;
```

**Status**: ✅ Complete with typed interface

---

### 7. `@procedures/client` (Core Client)

**Location**: `packages/client`

**Key Addition** (this session):
```typescript
// client/typed.ts - NEW
export function createTypedCaller<T extends ProcedureNamespace>(
  caller: BaseCaller
): TypedCaller<T>;

// Usage:
import type { MongoProcedures } from "@procedures/mongo";
const call = createTypedCaller<MongoProcedures>(client.call.bind(client));
const result = await call(["mongo", "documents", "find"], { query: {} });
// Full autocomplete on path, input typed, result typed!
```

**Status**: ✅ Added createTypedCaller

---

### 8. `minimongo` (UI Application)

**Location**: `~/git/minimongo`

**Bridge Registry** (`src/renderer/bridge/index.tsx`):
```typescript
// Configure bridge with remote procedure caller
export function configureBridge(config: {
  call?: ProcedureCaller;
  namespace?: string;
  preferProcedures?: boolean;
}): void;

// Register types discovered from remote peer
export function registerRemoteTypes(types: string[]): void;

// Get component (checks remote procedures, falls back to legacy)
export function getBridgeComponent(type: string): ComponentDefinition | undefined;
```

**RecursiveRenderer** uses `getBridgeComponent` for resolution.

**Status**: ✅ Bridge implemented, uses client-splay

---

## Typed RPC Flow

### Compile-Time Autocomplete Pattern

```typescript
// 1. Package exports typed interface
// client-mongo/src/procedures.types.ts
export interface MongoProcedures {
  mongo: {
    documents: {
      find: { input: FindInput; output: FindOutput };
    };
  };
}

// 2. Consumer creates typed caller
// app/src/index.ts
import type { MongoProcedures } from "@procedures/mongo";
import { createTypedCaller, Client, HttpTransport } from "@procedures/client";

const client = new Client(new HttpTransport({ baseUrl: "http://server:3000" }));
const call = createTypedCaller<MongoProcedures>(client.call.bind(client));

// 3. Full autocomplete!
const result = await call(
  ["mongo", "documents", "find"],  // ← path autocomplete
  { query: { status: "active" } }, // ← typed input
  { metadata: { collection: "users" } }
);
// result is FindOutput ← typed output
```

### Runtime Discovery Flow

```typescript
// 1. Connect to peer
const connection = await call(["server", "connect"], { address: "http://peer:3000" });

// 2. Peer announces its procedures via _discovery.announce
// Response: { procedures: [{ path: ["mongo", "documents", "find"], ... }] }

// 3. Register discovered types for bridge
registerRemoteTypes(connection.remoteProcedures.map(p => p.path.join(".")));

// 4. Configure bridge with caller
configureBridge({ call: client.call.bind(client) });

// 5. Now RecursiveRenderer can call remote procedures!
```

---

## Rendering Pipeline

### Server-Side Rendering (Bidirectional RPC)

```
┌─────────────────┐                      ┌─────────────────┐
│  Server (Node)  │                      │ Client (Browser)│
│                 │                      │                 │
│  Has: Data      │  ←── Connect ──────  │  Has: React     │
│  Wants: HTML    │                      │  Wants: Data    │
│                 │                      │                 │
│  1. Get data    │                      │                 │
│  2. Call client │  ── render proc ──→  │  3. Dispatch    │
│     render proc │                      │     to CompOut  │
│                 │  ←─ ComponentOut ──  │  4. Return      │
│  5. Hydrate to  │                      │                 │
│     HTML string │                      │                 │
└─────────────────┘                      └─────────────────┘
```

### Local Rendering

```
Data → dispatch() → ComponentOutput → hydrate() → ReactNode → DOM
         ↓
    inferType()
    registry.get(type)
    factory(ctx)
    ctx.render(child) [recursive]
```

---

## Remaining Work

### Phase 3: Bidirectional RPC (client-server): done

1. **Server → Client calls**: done in roadmap R24 (`b2a3e3a`). The calls go in both directions over one WebSocket.
2. **Streaming procedure updates**: remote events (`packages/documentation/EVENTS.md`) give a subscription to the topics of the other side.
3. **Connection management**: the reconnect, the heartbeat and the handshake limit came with roadmap R3, and the cancellation scopes with R14.

### Create client-splay-react Package

1. Give splay-react primitives as procedures. A component definition registers nothing: `componentModule()` gives the procedures as a module.
   ```typescript
   export const splayReactModule = componentModule("@procedures/splay-react", [
     defineComponent({ type: "string", namespace: "splay", factory: stringComponent }),
   ]);
   // src/register.ts: registerModules(PROCEDURE_REGISTRY, [splayReactModule]);
   ```

2. Export typed interface:
   ```typescript
   export interface SplayReactProcedures {
     components: {
       splay: {
         string: { input: ComponentInput; output: ComponentOutput };
         // ...
       };
     };
   }
   ```

### Update minimongo

1. Use new splay-react with ComponentOutput
2. Configure bridge with actual procedure caller
3. Test remote rendering

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `splay/src/types.ts` | ComponentOutput interface |
| `splay-react/src/components.ts` | Primitives returning ComponentOutput |
| `splay-react/src/hydrate.tsx` | ComponentOutput → React |
| `client/src/client/typed.ts` | createTypedCaller |
| `client-mongo/src/procedures.types.ts` | MongoProcedures interface |
| `client-server/src/discovery/index.ts` | _discovery.announce procedure |
| `client-server/src/manifest/typescript.ts` | .d.ts generation |
| `minimongo/src/renderer/bridge/index.tsx` | Bridge registry |

---

## Design Decisions

1. **ComponentOutput is in splay** (not client): Core serializable format should be framework-agnostic

2. **Hydration is separate from components**: Components return serializable output, hydration is framework-specific

3. **Types are manually defined** (not generated): For compile-time autocomplete, types must exist at compile time. Runtime discovery is for validation, not autocomplete.

4. **Bridge prefers legacy during migration**: `preferProcedures: false` by default so existing viewers keep working

5. **Procedures for everything**: Even server bootstrap (server.create, server.connect) are procedures, getting middleware benefits (retry, timeout, tracing)
