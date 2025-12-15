/**
 * Hydration
 *
 * Converts serializable ComponentOutput descriptors into framework-specific
 * components (React, Vue, Svelte, etc.).
 *
 * This enables the following flow:
 * 1. Server renders ComponentOutput (serializable)
 * 2. Output is sent over wire (JSON)
 * 3. Client hydrates to React/Vue/Svelte components
 */
import type { ComponentOutput } from "client/components";
import type { ComponentMap, HydrateOptions } from "./types.js";
/**
 * Create a hydrate function for a specific framework.
 *
 * @param options - Hydration options including component map
 * @returns Hydrate function that converts descriptors to framework components
 *
 * @example React:
 * ```typescript
 * import { createElement } from "react";
 * import { createHydrate } from "@mark1russell7/splay-client";
 *
 * const hydrate = createHydrate({
 *   components: {
 *     "user-card": UserCard,
 *     "badge": Badge,
 *   },
 *   fallback: UnknownComponent,
 * });
 *
 * // Use with React
 * function App({ descriptor }) {
 *   return hydrate(descriptor, createElement);
 * }
 * ```
 */
export declare function createHydrate<TComponent>(options: HydrateOptions<TComponent>): (descriptor: ComponentOutput | null, createElement: CreateElement<TComponent>) => TComponent | null;
/**
 * createElement function signature (React-compatible).
 */
export type CreateElement<TComponent> = (type: TComponent, props: Record<string, unknown> | null, children?: (TComponent | null)[]) => TComponent;
/**
 * Generic React-like component type (works with any framework that has createElement).
 */
type ReactLikeComponent = (props: Record<string, unknown>) => unknown;
/**
 * React-specific hydration options.
 */
export interface ReactHydrateOptions {
    /** Map of component types to React components */
    components: ComponentMap<ReactLikeComponent>;
    /** Fallback component for unknown types */
    fallback?: ReactLikeComponent;
}
/**
 * React-like module interface.
 */
interface ReactLike {
    createElement(type: ReactLikeComponent | symbol, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
    Fragment: symbol;
}
/**
 * Create a React-specific hydrate function.
 *
 * @param react - React module (import * as React from "react")
 * @param options - Hydration options
 * @returns Hydrate function for React
 *
 * @example
 * ```typescript
 * import * as React from "react";
 * import { createReactHydrate } from "@mark1russell7/splay-client";
 *
 * const hydrate = createReactHydrate(React, {
 *   components: {
 *     "user-card": UserCard,
 *     "badge": Badge,
 *   },
 * });
 *
 * function App({ descriptor }) {
 *   return hydrate(descriptor);
 * }
 * ```
 */
export declare function createReactHydrate(react: ReactLike, options: ReactHydrateOptions): (descriptor: ComponentOutput | null) => unknown;
/**
 * Walk a descriptor tree and apply a visitor to each node.
 */
export declare function walkDescriptor(descriptor: ComponentOutput, visitor: (node: ComponentOutput, path: string[]) => void, path?: string[]): void;
/**
 * Transform a descriptor tree.
 */
export declare function transformDescriptor(descriptor: ComponentOutput, transform: (node: ComponentOutput) => ComponentOutput): ComponentOutput;
/**
 * Find all nodes in a descriptor tree matching a predicate.
 */
export declare function findInDescriptor(descriptor: ComponentOutput, predicate: (node: ComponentOutput) => boolean): ComponentOutput[];
/**
 * Get all component types used in a descriptor tree.
 */
export declare function getUsedTypes(descriptor: ComponentOutput): Set<string>;
/**
 * Validate that all component types in a descriptor are known.
 */
export declare function validateDescriptor(descriptor: ComponentOutput, knownTypes: Set<string> | string[]): {
    valid: boolean;
    unknownTypes: string[];
};
/**
 * Serialize a descriptor to JSON string.
 */
export declare function serializeDescriptor(descriptor: ComponentOutput): string;
/**
 * Parse a descriptor from JSON string.
 */
export declare function parseDescriptor(json: string): ComponentOutput;
/**
 * Create a compact representation of a descriptor.
 * Removes undefined values and empty arrays.
 */
export declare function compactDescriptor(descriptor: ComponentOutput): ComponentOutput;
export {};
//# sourceMappingURL=hydrate.d.ts.map