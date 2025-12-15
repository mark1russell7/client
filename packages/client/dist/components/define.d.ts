/**
 * Component Definition Helpers
 *
 * Utilities for defining components as procedures.
 * Components are procedures with special handling for UI rendering.
 */
import type { ZodLike } from "../client/validation/types.js";
import type { Procedure, ProcedurePath } from "../procedures/types.js";
import type { ComponentDefinition, ComponentContext, ComponentOutput, ComponentBundle, AnyComponentDefinition, Size } from "./types.js";
/**
 * Standard component input structure.
 * Components receive data, size, and path for rendering.
 */
export interface ComponentInput<TData = unknown> {
    /** Component data */
    data: TData;
    /** Available size for rendering */
    size: Size;
    /** Path in render tree */
    path: string;
    /** Depth in render tree */
    depth?: number;
}
/**
 * Default component input schema.
 * Validates the standard { data, size, path } structure.
 */
export declare const componentInputSchema: ZodLike<ComponentInput>;
/**
 * Component output schema.
 * Validates that output is a serializable ComponentOutput.
 */
export declare const componentOutputSchema: ZodLike<ComponentOutput>;
/**
 * Define a component and convert it to a procedure.
 *
 * Components are registered under ["components", namespace?, type].
 *
 * @param definition - Component definition
 * @returns The component definition (for chaining)
 *
 * @example
 * ```typescript
 * // Simple component
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
 * // Streaming component
 * const liveDashboard = defineComponent({
 *   type: "live-dashboard",
 *   streaming: true,
 *   factory: async function* (ctx) {
 *     yield { type: "dashboard", props: { loading: true } };
 *     for await (const data of ctx.bus.stream("updates")) {
 *       yield { type: "dashboard", props: { data } };
 *     }
 *   },
 * });
 * ```
 */
export declare function defineComponent<TData = unknown>(definition: ComponentDefinition<TData>): ComponentDefinition<TData>;
/**
 * Convert a component definition to a procedure.
 *
 * @param definition - Component definition
 * @param path - Procedure path
 * @returns Procedure that wraps the component
 */
export declare function componentToProcedure<TData>(definition: ComponentDefinition<TData>, path: ProcedurePath): Procedure<ComponentInput<TData>, ComponentOutput>;
/**
 * Register a bundle of components.
 *
 * @param bundle - Component bundle
 * @returns The registered components
 *
 * @example
 * ```typescript
 * const registered = registerBundle({
 *   namespace: "ui",
 *   components: [buttonComponent, cardComponent],
 * });
 * ```
 */
export declare function registerBundle(bundle: ComponentBundle): AnyComponentDefinition[];
/**
 * Create a component bundle.
 *
 * @param namespace - Shared namespace
 * @param components - Component definitions
 * @param metadata - Optional bundle metadata
 * @returns ComponentBundle
 */
export declare function createBundle(namespace: string, components: AnyComponentDefinition[], metadata?: ComponentBundle["metadata"]): ComponentBundle;
/**
 * Define a simple component with minimal boilerplate.
 *
 * @param type - Component type
 * @param factory - Factory function
 * @returns ComponentDefinition
 *
 * @example
 * ```typescript
 * const badge = simpleComponent("badge", (ctx) => ({
 *   type: "badge",
 *   props: { label: ctx.data.label },
 * }));
 * ```
 */
export declare function simpleComponent<TData = unknown>(type: string, factory: (ctx: ComponentContext<TData>) => ComponentOutput): ComponentDefinition<TData>;
/**
 * Define a namespaced component with minimal boilerplate.
 *
 * @param namespace - Component namespace
 * @param type - Component type
 * @param factory - Factory function
 * @returns ComponentDefinition
 */
export declare function namespacedComponent<TData = unknown>(namespace: string, type: string, factory: (ctx: ComponentContext<TData>) => ComponentOutput): ComponentDefinition<TData>;
/**
 * Define a streaming component.
 *
 * @param type - Component type
 * @param factory - Generator factory function
 * @returns ComponentDefinition
 */
export declare function streamingComponent<TData = unknown>(type: string, factory: (ctx: ComponentContext<TData>) => AsyncGenerator<ComponentOutput, void, unknown>): ComponentDefinition<TData>;
//# sourceMappingURL=define.d.ts.map