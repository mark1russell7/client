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

import type { ComponentOutput } from "@mark1russell7/client/components";
import type { ComponentMap, HydrateOptions } from "./types.js";

// Portable console access (works in Node and browser)
type ConsoleType = {
  warn(message: string): void;
  log(message: string): void;
  error(message: string): void;
};
const log = (globalThis as unknown as { console: ConsoleType }).console;

// =============================================================================
// Hydration Core
// =============================================================================

/**
 * Create a hydrate function for a specific framework.
 *
 * @param options - Hydration options including component map
 * @returns Hydrate function that converts descriptors to framework components
 *
 * @example React:
 * ```typescript
 * import { createElement } from "react";
 * import { createHydrate } from "@mark1russell7/client-splay";
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
export function createHydrate<TComponent>(
  options: HydrateOptions<TComponent>
): (
  descriptor: ComponentOutput | null,
  createElement: CreateElement<TComponent>
) => TComponent | null {
  const { components, fallback, onNull, onFragment } = options;

  return function hydrate(
    descriptor: ComponentOutput | null,
    createElement: CreateElement<TComponent>
  ): TComponent | null {
    // Handle null
    if (descriptor === null) {
      return onNull?.() ?? null;
    }

    // Handle null output type
    if (descriptor.type === "__null__") {
      return onNull?.() ?? null;
    }

    // Handle fragment
    if (descriptor.type === "__fragment__") {
      const children = (descriptor.children ?? []).map((child) =>
        hydrate(child, createElement)
      );

      if (onFragment) {
        return onFragment(children.filter((c): c is TComponent => c !== null));
      }

      // Default: return first child or null
      return children[0] ?? null;
    }

    // Look up component
    const Component = components[descriptor.type] ?? fallback;

    if (!Component) {
      log.warn(`Unknown component type: ${descriptor.type}`);
      return null;
    }

    // Hydrate children recursively
    const hydratedChildren = descriptor.children?.map((child) =>
      hydrate(child, createElement)
    );

    // Create the component
    return createElement(
      Component,
      { ...descriptor.props, key: descriptor.key },
      hydratedChildren
    );
  };
}

/**
 * createElement function signature (React-compatible).
 */
export type CreateElement<TComponent> = (
  type: TComponent,
  props: Record<string, unknown> | null,
  children?: (TComponent | null)[]
) => TComponent;

// =============================================================================
// React-Specific Hydration
// =============================================================================

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
  createElement(
    type: ReactLikeComponent | symbol,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
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
 * import { createReactHydrate } from "@mark1russell7/client-splay";
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
export function createReactHydrate(
  react: ReactLike,
  options: ReactHydrateOptions
): (descriptor: ComponentOutput | null) => unknown {
  const { components, fallback } = options;

  function hydrate(descriptor: ComponentOutput | null): unknown {
    if (descriptor === null) {
      return null;
    }

    if (descriptor.type === "__null__") {
      return null;
    }

    if (descriptor.type === "__fragment__") {
      const children = (descriptor.children ?? []).map((child: ComponentOutput) => hydrate(child));
      return react.createElement(react.Fragment, null, ...children);
    }

    const Component = components[descriptor.type];

    if (!Component) {
      if (fallback) {
        return react.createElement(fallback, {
          type: descriptor.type,
          props: descriptor.props,
        });
      }
      log.warn(`Unknown component type: ${descriptor.type}`);
      return null;
    }

    const hydratedChildren = descriptor.children?.map((child: ComponentOutput) => hydrate(child));

    return react.createElement(
      Component,
      { ...descriptor.props, key: descriptor.key },
      ...(hydratedChildren ?? [])
    );
  }

  return hydrate;
}

// =============================================================================
// Descriptor Utilities
// =============================================================================

/**
 * Walk a descriptor tree and apply a visitor to each node.
 */
export function walkDescriptor(
  descriptor: ComponentOutput,
  visitor: (node: ComponentOutput, path: string[]) => void,
  path: string[] = []
): void {
  visitor(descriptor, path);

  if (descriptor.children) {
    descriptor.children.forEach((child: ComponentOutput, index: number) => {
      walkDescriptor(child, visitor, [...path, `children[${index}]`]);
    });
  }
}

/**
 * Transform a descriptor tree.
 */
export function transformDescriptor(
  descriptor: ComponentOutput,
  transform: (node: ComponentOutput) => ComponentOutput
): ComponentOutput {
  const transformed = transform(descriptor);

  if (transformed.children) {
    return {
      ...transformed,
      children: transformed.children.map((child: ComponentOutput) =>
        transformDescriptor(child, transform)
      ),
    };
  }

  return transformed;
}

/**
 * Find all nodes in a descriptor tree matching a predicate.
 */
export function findInDescriptor(
  descriptor: ComponentOutput,
  predicate: (node: ComponentOutput) => boolean
): ComponentOutput[] {
  const results: ComponentOutput[] = [];

  walkDescriptor(descriptor, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });

  return results;
}

/**
 * Get all component types used in a descriptor tree.
 */
export function getUsedTypes(descriptor: ComponentOutput): Set<string> {
  const types = new Set<string>();

  walkDescriptor(descriptor, (node) => {
    if (node.type !== "__null__" && node.type !== "__fragment__") {
      types.add(node.type);
    }
  });

  return types;
}

/**
 * Validate that all component types in a descriptor are known.
 */
export function validateDescriptor(
  descriptor: ComponentOutput,
  knownTypes: Set<string> | string[]
): { valid: boolean; unknownTypes: string[] } {
  const known = knownTypes instanceof Set ? knownTypes : new Set(knownTypes);
  const used = getUsedTypes(descriptor);
  const unknownTypes: string[] = [];

  for (const type of used) {
    if (!known.has(type)) {
      unknownTypes.push(type);
    }
  }

  return {
    valid: unknownTypes.length === 0,
    unknownTypes,
  };
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Serialize a descriptor to JSON string.
 */
export function serializeDescriptor(descriptor: ComponentOutput): string {
  return JSON.stringify(descriptor);
}

/**
 * Parse a descriptor from JSON string.
 */
export function parseDescriptor(json: string): ComponentOutput {
  return JSON.parse(json) as ComponentOutput;
}

/**
 * Create a compact representation of a descriptor.
 * Removes undefined values and empty arrays.
 */
export function compactDescriptor(descriptor: ComponentOutput): ComponentOutput {
  const result: ComponentOutput = {
    type: descriptor.type,
    props: descriptor.props,
  };

  if (descriptor.children && descriptor.children.length > 0) {
    result.children = descriptor.children.map(compactDescriptor);
  }

  if (descriptor.key !== undefined) {
    result.key = descriptor.key;
  }

  return result;
}
