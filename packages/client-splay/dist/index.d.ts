/**
 * splay-client
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
 * } from "@mark1russell7/splay-client";
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
export type { RenderContext, ComponentRenderer, StreamingComponentRenderer, Registry, StreamingRegistry, ClientRegistryOptions, StreamingRegistryOptions, ComponentMap, HydrateOptions, } from "./types.js";
export { createClientRegistry, createCheckedRegistry, createRenderContext, type ProcedureCaller, } from "./registry.js";
export { createStreamingRegistry, createDualRegistry, mergeStreams, throttleStream, debounceStream, type StreamingProcedureCaller, type DualRegistry, } from "./streaming.js";
export { createHydrate, createReactHydrate, walkDescriptor, transformDescriptor, findInDescriptor, getUsedTypes, validateDescriptor, serializeDescriptor, parseDescriptor, compactDescriptor, type CreateElement, type ReactHydrateOptions, } from "./hydrate.js";
export type { ComponentOutput, FragmentOutput, NullOutput, AnyComponentOutput, Size, ComponentContext, ComponentFactory, StreamingComponentFactory, ComponentDefinition, ComponentBundle, } from "client/components";
export { nullOutput, fragment, isFragment, isNullOutput, defineComponent, simpleComponent, streamingComponent, } from "client/components";
//# sourceMappingURL=index.d.ts.map