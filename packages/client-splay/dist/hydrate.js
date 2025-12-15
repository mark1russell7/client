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
const log = globalThis.console;
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
export function createHydrate(options) {
    const { components, fallback, onNull, onFragment } = options;
    return function hydrate(descriptor, createElement) {
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
            const children = (descriptor.children ?? []).map((child) => hydrate(child, createElement));
            if (onFragment) {
                return onFragment(children.filter((c) => c !== null));
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
        const hydratedChildren = descriptor.children?.map((child) => hydrate(child, createElement));
        // Create the component
        return createElement(Component, { ...descriptor.props, key: descriptor.key }, hydratedChildren);
    };
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
export function createReactHydrate(react, options) {
    const { components, fallback } = options;
    function hydrate(descriptor) {
        if (descriptor === null) {
            return null;
        }
        if (descriptor.type === "__null__") {
            return null;
        }
        if (descriptor.type === "__fragment__") {
            const children = (descriptor.children ?? []).map((child) => hydrate(child));
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
        const hydratedChildren = descriptor.children?.map((child) => hydrate(child));
        return react.createElement(Component, { ...descriptor.props, key: descriptor.key }, ...(hydratedChildren ?? []));
    }
    return hydrate;
}
// =============================================================================
// Descriptor Utilities
// =============================================================================
/**
 * Walk a descriptor tree and apply a visitor to each node.
 */
export function walkDescriptor(descriptor, visitor, path = []) {
    visitor(descriptor, path);
    if (descriptor.children) {
        descriptor.children.forEach((child, index) => {
            walkDescriptor(child, visitor, [...path, `children[${index}]`]);
        });
    }
}
/**
 * Transform a descriptor tree.
 */
export function transformDescriptor(descriptor, transform) {
    const transformed = transform(descriptor);
    if (transformed.children) {
        return {
            ...transformed,
            children: transformed.children.map((child) => transformDescriptor(child, transform)),
        };
    }
    return transformed;
}
/**
 * Find all nodes in a descriptor tree matching a predicate.
 */
export function findInDescriptor(descriptor, predicate) {
    const results = [];
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
export function getUsedTypes(descriptor) {
    const types = new Set();
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
export function validateDescriptor(descriptor, knownTypes) {
    const known = knownTypes instanceof Set ? knownTypes : new Set(knownTypes);
    const used = getUsedTypes(descriptor);
    const unknownTypes = [];
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
export function serializeDescriptor(descriptor) {
    return JSON.stringify(descriptor);
}
/**
 * Parse a descriptor from JSON string.
 */
export function parseDescriptor(json) {
    return JSON.parse(json);
}
/**
 * Create a compact representation of a descriptor.
 * Removes undefined values and empty arrays.
 */
export function compactDescriptor(descriptor) {
    const result = {
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
//# sourceMappingURL=hydrate.js.map