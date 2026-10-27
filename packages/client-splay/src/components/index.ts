/**
 * Components Module
 *
 * Components are procedures that return serializable UI descriptors.
 * This enables SSR, caching, and transport over wire.
 *
 * @example
 * ```typescript
 * import { defineComponent, simpleComponent, componentModule, createBundle } from "@procedures/splay";
 * import { createRegistry } from "@procedures/client";
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
 * // The definitions register nothing: a module gives their procedures to a registry
 * const registry = createRegistry(componentModule("my-app/ui", createBundle("ui", [userCard, badge])));
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
  componentModule,
  componentToProcedure,
  createBundle,
  simpleComponent,
  namespacedComponent,
  streamingComponent,
  componentInputSchema,
  componentOutputSchema,
} from "./define.js";
