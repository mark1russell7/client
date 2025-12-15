/**
 * Component Types
 *
 * Components are procedures that return serializable UI descriptors.
 * This enables SSR, caching, and transport over wire.
 *
 * Components integrate with splay's rendering model where a renderer
 * produces output based on data, size, and path context.
 */

import type { ZodLike } from "../client/validation/types.js";
import type { ProcedureMetadata, ProcedurePath } from "../procedures/types.js";
import type { EventBus } from "../events/types.js";

// =============================================================================
// Component Output (Serializable Descriptor)
// =============================================================================

/**
 * Serializable component output descriptor.
 * Can be transported over wire, cached, and hydrated by any framework.
 *
 * @example
 * ```typescript
 * const descriptor: ComponentOutput = {
 *   type: "user-card",
 *   props: {
 *     name: "John Doe",
 *     avatar: "/images/john.png",
 *   },
 *   children: [
 *     { type: "badge", props: { label: "Admin" } },
 *   ],
 * };
 * ```
 */
export interface ComponentOutput {
  /** Component type identifier (maps to registered component) */
  type: string;

  /** Serializable props for the component */
  props: Record<string, unknown>;

  /** Nested child descriptors (optional) */
  children?: ComponentOutput[];

  /** Component key for reconciliation (optional) */
  key?: string;
}

/**
 * Fragment output - multiple components without wrapper.
 */
export interface FragmentOutput {
  type: "__fragment__";
  children: ComponentOutput[];
}

/**
 * Null output - render nothing.
 */
export interface NullOutput {
  type: "__null__";
}

/**
 * Any valid component output.
 */
export type AnyComponentOutput = ComponentOutput | FragmentOutput | NullOutput;

// =============================================================================
// Component Context (splay-compatible)
// =============================================================================

/**
 * Size information for responsive rendering.
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * Context passed to component factories.
 * Compatible with splay's RenderContext.
 *
 * @example
 * ```typescript
 * factory: (ctx) => ({
 *   type: "user-card",
 *   props: {
 *     user: ctx.data,
 *     compact: ctx.size.width < 400,
 *   },
 *   children: ctx.data.posts?.map((post, i) =>
 *     ctx.render(post, ctx.size, `${ctx.path}.posts[${i}]`)
 *   ),
 * })
 * ```
 */
export interface ComponentContext<TData = unknown> {
  /** Input data for the component */
  data: TData;

  /** Available rendering size */
  size: Size;

  /** Path in the render tree (for debugging and keys) */
  path: string;

  /** Current depth in the render tree */
  depth: number;

  /**
   * Render a child component.
   * Delegates to the renderer to produce a ComponentOutput.
   *
   * @param data - Data for the child component
   * @param size - Size available for the child
   * @param path - Path for the child (for keys and debugging)
   * @returns ComponentOutput from the child render
   */
  render: (data: unknown, size: Size, path: string) => ComponentOutput | Promise<ComponentOutput>;

  /**
   * Event bus for streaming coordination.
   * Available when executing in a procedure context.
   */
  bus?: EventBus;

  /**
   * Additional metadata from the procedure context.
   */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Component Definition
// =============================================================================

/**
 * Component factory function (single output).
 * Returns a serializable component descriptor.
 */
export type ComponentFactory<TData = unknown> = (
  ctx: ComponentContext<TData>
) => ComponentOutput | Promise<ComponentOutput>;

/**
 * Streaming component factory (multi-yield).
 * Yields descriptors over time for live updates.
 */
export type StreamingComponentFactory<TData = unknown> = (
  ctx: ComponentContext<TData>
) => AsyncGenerator<ComponentOutput, void, unknown>;

/**
 * Any component factory (single or streaming).
 */
export type AnyComponentFactory<TData = unknown> =
  | ComponentFactory<TData>
  | StreamingComponentFactory<TData>;

/**
 * Component metadata (extends ProcedureMetadata).
 */
export interface ComponentMetadata extends ProcedureMetadata {
  /** Component category for organization */
  category?: string;

  /** Whether the component supports streaming updates */
  streaming?: boolean;

  /** Default size constraints */
  defaultSize?: Size;

  /** Minimum size constraints */
  minSize?: Size;

  /** Maximum size constraints */
  maxSize?: Size;
}

/**
 * Component definition.
 * Wraps a factory function with type information and metadata.
 *
 * @example
 * ```typescript
 * const userCard: ComponentDefinition<User> = {
 *   type: "user-card",
 *   namespace: "ui",
 *   input: userSchema,
 *   metadata: {
 *     description: "Displays user information",
 *     category: "profile",
 *   },
 *   factory: (ctx) => ({
 *     type: "user-card",
 *     props: { user: ctx.data },
 *   }),
 * };
 * ```
 */
export interface ComponentDefinition<TData = unknown> {
  /** Component type identifier */
  type: string;

  /**
   * Namespace for the component (optional).
   * Results in path: ["components", namespace, type]
   *
   * @example
   * namespace: "ui" → ["components", "ui", "user-card"]
   */
  namespace?: string;

  /**
   * Input schema for validating component data.
   * Optional - if not provided, accepts any data.
   */
  input?: ZodLike<TData>;

  /**
   * Component metadata for documentation and tooling.
   */
  metadata?: ComponentMetadata;

  /**
   * Whether this component streams updates.
   * When true, factory is expected to be a generator.
   */
  streaming?: boolean;

  /**
   * Component factory function.
   * Can be a regular function (single output) or generator (streaming).
   */
  factory: AnyComponentFactory<TData>;
}

/**
 * Any component definition (type-erased for storage).
 */
export type AnyComponentDefinition = ComponentDefinition<unknown>;

// =============================================================================
// Component Registry Types
// =============================================================================

/**
 * Registered component with resolved path.
 */
export interface RegisteredComponent<TData = unknown> {
  /** Full procedure path */
  path: ProcedurePath;

  /** Original component definition */
  definition: ComponentDefinition<TData>;
}

/**
 * Component bundle - collection of components with shared namespace.
 *
 * @example
 * ```typescript
 * const uiComponents: ComponentBundle = {
 *   namespace: "ui",
 *   components: [
 *     buttonComponent,
 *     cardComponent,
 *     modalComponent,
 *   ],
 * };
 * ```
 */
export interface ComponentBundle {
  /** Shared namespace for all components in bundle */
  namespace: string;

  /** Component definitions */
  components: AnyComponentDefinition[];

  /** Bundle metadata */
  metadata?: {
    /** Bundle name */
    name?: string;
    /** Bundle description */
    description?: string;
    /** Bundle version */
    version?: string;
  };
}

// =============================================================================
// Type Inference Utilities
// =============================================================================

/**
 * Infer input type from a component definition.
 */
export type InferComponentInput<T> = T extends ComponentDefinition<infer TData>
  ? TData
  : unknown;

/**
 * Infer whether a component is streaming.
 */
export type IsStreamingComponent<T> = T extends ComponentDefinition<unknown>
  ? T["streaming"] extends true
    ? true
    : false
  : false;

// =============================================================================
// Output Helpers
// =============================================================================

/**
 * Create a null output (render nothing).
 */
export function nullOutput(): NullOutput {
  return { type: "__null__" };
}

/**
 * Create a fragment output (multiple children without wrapper).
 */
export function fragment(...children: ComponentOutput[]): FragmentOutput {
  return { type: "__fragment__", children };
}

/**
 * Check if output is a fragment.
 */
export function isFragment(output: AnyComponentOutput): output is FragmentOutput {
  return output.type === "__fragment__";
}

/**
 * Check if output is null.
 */
export function isNullOutput(output: AnyComponentOutput): output is NullOutput {
  return output.type === "__null__";
}

/**
 * Check if a factory is a streaming generator.
 */
export function isStreamingFactory<TData>(
  factory: AnyComponentFactory<TData>
): factory is StreamingComponentFactory<TData> {
  return factory.constructor.name === "AsyncGeneratorFunction";
}
