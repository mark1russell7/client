# @mark1russell7/splay-client

Bridge between splay's rendering model and client's procedure system. Enables component rendering via RPC.

## Installation

```bash
npm install github:mark1russell7/splay-client#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                              │
│                                                                 │
│   const output = await registry.get("user-card")!(ctx);        │
│   const element = hydrate(output);                              │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      splay-client                               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      Registry                              │ │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐   │ │
│  │  │ ClientRegistry  │    │  StreamingRegistry          │   │ │
│  │  │ (sync calls)    │    │  (async iterables)          │   │ │
│  │  └────────┬────────┘    └─────────────┬───────────────┘   │ │
│  │           │                           │                    │ │
│  │           └───────────┬───────────────┘                    │ │
│  │                       ▼                                    │ │
│  │              ┌─────────────────┐                          │ │
│  │              │  DualRegistry   │                          │ │
│  │              │ (sync+streaming)│                          │ │
│  │              └─────────────────┘                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                     Hydration                              │ │
│  │                                                            │ │
│  │   ComponentOutput ──► createReactHydrate ──► ReactElement │ │
│  │   (serializable)       (framework-specific)               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Client (RPC)                                │
│                                                                 │
│   client.call(["components", "user-card"], input)              │
│   client.stream(["components", "live-feed"], input)            │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { createClientRegistry, createReactHydrate } from "@mark1russell7/splay-client";
import { call } from "client";

// 1. Create registry backed by client procedures
const registry = createClientRegistry(call, { namespace: "ui" });

// 2. Create hydrator for React
const hydrate = createReactHydrate(React, {
  components: {
    "user-card": UserCard,
    "badge": Badge,
  },
});

// 3. Render a component
const ctx = { data: { userId: 123 }, size: { width: 400, height: 300 } };
const descriptor = await registry.get("user-card")!(ctx);
const element = hydrate(descriptor);
```

## API Reference

### Registry

```typescript
// Sync registry - single response per call
const registry = createClientRegistry(call, {
  namespace?: string,  // Procedure path prefix
});

// Streaming registry - multiple responses
const streaming = createStreamingRegistry(stream, {
  namespace?: string,
  bufferSize?: number,  // Default: 16
});

// Dual registry - both sync and streaming
const dual = createDualRegistry(call, stream, isStreaming, options);
```

### Hydration

```typescript
// Generic hydration (any framework)
const hydrate = createHydrate<ReactElement>({
  components: ComponentMap,
  fallback?: Component,
  onNull?: () => TComponent,
  onFragment?: (children) => TComponent,
});

// React-specific
const hydrate = createReactHydrate(React, {
  components: { "user-card": UserCard },
  fallback?: UnknownComponent,
});
```

### Descriptor Utilities

```typescript
// Traverse descriptor tree
walkDescriptor(descriptor, (node, path) => { ... });

// Transform nodes
const transformed = transformDescriptor(descriptor, node => ({
  ...node,
  props: { ...node.props, className: "styled" }
}));

// Find matching nodes
const buttons = findInDescriptor(descriptor, n => n.type === "button");

// Get all component types used
const types: Set<string> = getUsedTypes(descriptor);

// Validate against known types
const { valid, unknownTypes } = validateDescriptor(descriptor, knownTypes);

// Serialization
const json = serializeDescriptor(descriptor);
const parsed = parseDescriptor(json);
const compact = compactDescriptor(descriptor); // Remove empty values
```

### Stream Utilities

```typescript
// Merge multiple streams
for await (const output of mergeStreams(stream1, stream2)) { ... }

// Rate limiting
for await (const output of throttleStream(stream, 100)) { ... }  // Max 1 per 100ms
for await (const output of debounceStream(stream, 200)) { ... }  // Wait 200ms quiet
```

## ComponentOutput

The wire format for component descriptors:

```typescript
interface ComponentOutput {
  type: string;                    // Component type or "__null__" / "__fragment__"
  props: Record<string, unknown>;  // Component props
  children?: ComponentOutput[];    // Nested children
  key?: string | number;           // React key
}
```

## Procedures

Registered automatically:

| Path | Description |
|------|-------------|
| `["splay", "bridge", "info"]` | Package information |
| `["splay", "bridge", "health"]` | Health check |

## Re-exports

Component types and helpers from `client/components`:

```typescript
import {
  // Types
  ComponentOutput, FragmentOutput, NullOutput, Size,
  ComponentContext, ComponentFactory, ComponentDefinition,
  // Helpers
  nullOutput, fragment, isFragment, isNullOutput,
  defineComponent, simpleComponent, streamingComponent,
} from "@mark1russell7/splay-client";
```
