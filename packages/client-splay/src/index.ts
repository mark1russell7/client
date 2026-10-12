/**
 * client-splay
 *
 * Bridge between splay's rendering model and client's procedure system.
 *
 * This package enables:
 * - Using client procedures as splay renderers
 * - Streaming component updates via procedures
 * - Hydrating serializable descriptors to framework components
 *
 * @example
 * ```typescript
 * import { call } from "client";
 * import {
 *   createClientRegistry,
 *   createReactHydrate,
 * } from "@mark1russell7/client-splay";
 *
 * // Create a registry backed by client procedures
 * const registry = createClientRegistry(call, {
 *   namespace: "ui",
 * });
 *
 * // Hydrate descriptors to React components
 * const hydrate = createReactHydrate(React, {
 *   components: { "user-card": UserCard },
 * });
 *
 * // Render a component
 * const descriptor = await registry.get("user-card")!(ctx);
 * const element = hydrate(descriptor);
 * ```
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

// =============================================================================
// Types
// =============================================================================

export type {
  // Render context
  RenderContext,

  // Registry interfaces
  ComponentRenderer,
  StreamingComponentRenderer,
  Registry,
  StreamingRegistry,

  // Registry options
  ClientRegistryOptions,
  StreamingRegistryOptions,

  // Hydration
  ComponentMap,
  HydrateOptions,
} from "./types.js";

// =============================================================================
// Registry
// =============================================================================

export {
  createClientRegistry,
  createCheckedRegistry,
  createRenderContext,
  type ProcedureCaller,
} from "./registry.js";

// =============================================================================
// Streaming
// =============================================================================

export {
  createStreamingRegistry,
  createDualRegistry,
  mergeStreams,
  throttleStream,
  debounceStream,
  type StreamingProcedureCaller,
  type DualRegistry,
} from "./streaming.js";

// =============================================================================
// Hydration
// =============================================================================

export {
  createHydrate,
  createReactHydrate,
  walkDescriptor,
  transformDescriptor,
  findInDescriptor,
  getUsedTypes,
  validateDescriptor,
  serializeDescriptor,
  parseDescriptor,
  compactDescriptor,
  type CreateElement,
  type ReactHydrateOptions,
} from "./hydrate.js";

// =============================================================================
// Components
// =============================================================================

// The components: serializable UI descriptors made by procedures. They moved here from
// "@mark1russell7/client/components" (roadmap 3.4: this is the UI package of the ecosystem).
export * from "./components/index.js";
