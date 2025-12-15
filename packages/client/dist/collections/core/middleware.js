/**
 * Middleware composition system for collections.
 *
 * Provides the core composition mechanism that allows behaviors to be
 * layered on top of collections using the decorator pattern.
 *
 * This is a specialized form of the unified middleware system (common/src/middleware)
 * optimized for synchronous collection operations. While the unified system supports
 * both sync and async with explicit context objects, collections use a simpler pattern
 * where the collection instance itself serves as the context.
 *
 * @example
 * const list = compose(
 *   safeList(),
 *   eventedList(),
 *   boundedList({ capacity: 100 })
 * )(arrayList<number>())
 */
// Implementation
export function compose(...layers) {
    return (base) => layers.reduceRight((acc, layer) => layer(acc), base);
}
/**
 * Utility to check if a collection has a specific capability.
 * Useful for middleware that wants to conditionally enhance behavior.
 *
 * @example
 * if (hasCapability(collection, 'on')) {
 *   // Collection supports events
 *   collection.on('add', handler)
 * }
 */
export const hasCapability = (collection, capability) => {
    return capability in collection;
};
/**
 * Helper to create a proxy that intercepts method calls.
 * Useful for implementing middleware that needs to wrap method invocations.
 *
 * @example
 * const logged = interceptMethods(collection, (target, method, args) => {
 *   console.log(`Calling ${String(method)} with`, args)
 *   const result = Reflect.apply(target[method], target, args)
 *   console.log(`Result:`, result)
 *   return result
 * })
 */
export const interceptMethods = (target, interceptor) => {
    return new Proxy(target, {
        get(t, prop, receiver) {
            const value = Reflect.get(t, prop, receiver);
            if (typeof value === "function" && typeof prop === "string") {
                return function (...args) {
                    return interceptor(t, prop, args);
                };
            }
            return value;
        },
    });
};
/**
 * Helper to create a readonly view of a collection by blocking mutating methods.
 *
 * @param mutatingMethods Set of method names that should be blocked
 * @param errorMessage Custom error message to throw
 */
export const blockMethods = (target, mutatingMethods, errorMessage = "Operation not allowed") => {
    return new Proxy(target, {
        get(t, prop, receiver) {
            const value = Reflect.get(t, prop, receiver);
            if (typeof value === "function" && mutatingMethods.has(prop)) {
                return () => {
                    throw new Error(errorMessage);
                };
            }
            return value;
        },
    });
};
/**
 * Helper to delegate method calls to a target while maintaining correct context.
 * Useful when wrapping collections.
 */
export const delegate = (target, wrapper) => {
    return new Proxy(target, {
        get(t, prop, receiver) {
            // If wrapper has the property, use it
            if (prop in wrapper) {
                return Reflect.get(wrapper, prop, receiver);
            }
            // Otherwise delegate to target
            const value = Reflect.get(t, prop, receiver);
            // Bind methods to maintain correct 'this' context
            if (typeof value === "function") {
                return value.bind(t);
            }
            return value;
        },
    });
};
/**
 * Builder pattern helper for fluent API construction.
 *
 * @example
 * class ListBuilder<T> {
 *   private middleware: Middleware<List<T>>[] = []
 *
 *   bounded(capacity: number) {
 *     this.middleware.push(boundedList({ capacity }))
 *     return this
 *   }
 *
 *   evented() {
 *     this.middleware.push(eventedList())
 *     return this
 *   }
 *
 *   build(): List<T> {
 *     return compose(...this.middleware)(arrayList<T>())
 *   }
 * }
 */
export class CollectionBuilder {
    middleware = [];
    /**
     * Apply a custom middleware.
     */
    use(middleware) {
        this.middleware.push(middleware);
        return this;
    }
}
/**
 * Utility to create a middleware that only enhances specific methods.
 *
 * @example
 * const logAdd = enhanceMethod('add', (original, args) => {
 *   console.log('Adding:', args[0])
 *   return original(...args)
 * })
 */
export const enhanceMethod = (methodName, enhancer) => {
    return (next) => {
        return new Proxy(next, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (prop === methodName && typeof value === "function") {
                    return function (...args) {
                        return enhancer(value.bind(target), args);
                    };
                }
                return value;
            },
        });
    };
};
// Implementation
export function bundle(...middleware) {
    return (next) => compose(...middleware)(next);
}
//# sourceMappingURL=middleware.js.map