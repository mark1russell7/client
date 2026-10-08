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
// =============================================================================
// Registry
// =============================================================================
export { createClientRegistry, createCheckedRegistry, createRenderContext, } from "./registry.js";
// =============================================================================
// Streaming
// =============================================================================
export { createStreamingRegistry, createDualRegistry, mergeStreams, throttleStream, debounceStream, } from "./streaming.js";
// =============================================================================
// Hydration
// =============================================================================
export { createHydrate, createReactHydrate, walkDescriptor, transformDescriptor, findInDescriptor, getUsedTypes, validateDescriptor, serializeDescriptor, parseDescriptor, compactDescriptor, } from "./hydrate.js";
// Re-export component helpers
export { nullOutput, fragment, isFragment, isNullOutput, defineComponent, simpleComponent, streamingComponent, } from "@mark1russell7/client/components";
//# sourceMappingURL=index.js.map