/**
 * Components Module
 *
 * Components are procedures that return serializable UI descriptors.
 * This enables SSR, caching, and transport over wire.
 *
 * @example
 * ```typescript
 * import { defineComponent, simpleComponent, registerBundle } from "client/components";
 *
 * // Define a component
 * const userCard = defineComponent({
 *   type: "user-card",
 *   namespace: "ui",
 *   input: userSchema,
 *   factory: (ctx) => ({
 *     type: "user-card",
 *     props: { user: ctx.data },
 *   }),
 * });
 *
 * // Simple shorthand
 * const badge = simpleComponent("badge", (ctx) => ({
 *   type: "badge",
 *   props: { label: ctx.data.label },
 * }));
 *
 * // Register a bundle
 * registerBundle({
 *   namespace: "ui",
 *   components: [buttonComponent, cardComponent],
 * });
 * ```
 */

// Types
export type {
  ComponentOutput,
  FragmentOutput,
  NullOutput,
  AnyComponentOutput,
  Size,
  ComponentContext,
  ComponentFactory,
  StreamingComponentFactory,
  AnyComponentFactory,
  ComponentMetadata,
  ComponentDefinition,
  AnyComponentDefinition,
  RegisteredComponent,
  ComponentBundle,
  InferComponentInput,
  IsStreamingComponent,
} from "./types.js";

// Type utilities
export {
  nullOutput,
  fragment,
  isFragment,
  isNullOutput,
  isStreamingFactory,
} from "./types.js";

// Definition helpers
export type { ComponentInput } from "./define.js";

export {
  defineComponent,
  componentToProcedure,
  registerBundle,
  createBundle,
  simpleComponent,
  namespacedComponent,
  streamingComponent,
  componentInputSchema,
  componentOutputSchema,
} from "./define.js";
