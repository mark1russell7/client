/**
 * Bounded behavior - Enforces capacity limits on collections.
 *
 * Wraps collections to prevent them from exceeding a maximum size.
 * Provides various overflow policies to handle full collections.
 *
 * @example
 * const list = compose(
 *   boundedList({ capacity: 100, policy: 'drop-oldest' })
 * )(arrayList<number>())
 *
 * // Add 101 elements - first element will be dropped
 * for (let i = 0; i < 101; i++) {
 *   list.add(i)
 * }
 */
/**
 * Creates a bounded List middleware.
 *
 * Intercepts add operations to enforce capacity limits.
 * Supports multiple overflow policies.
 */
export function boundedList(options) {
    const { capacity, policy = "throw", onOverflow } = options;
    return (next) => {
        const handleOverflow = (element) => {
            // Call overflow handler if provided
            if (onOverflow) {
                const context = {
                    newElement: element,
                    currentSize: next.size,
                    capacity,
                    timestamp: Date.now(),
                };
                onOverflow(context);
            }
            // Apply policy
            switch (policy) {
                case "throw":
                    throw new Error(`List is full (capacity: ${capacity})`);
                case "drop-oldest":
                    // Remove first element
                    if (!next.isEmpty) {
                        next.shift();
                    }
                    break;
                case "drop-newest":
                    // Don't add the new element (do nothing)
                    return;
                case "reject":
                    // Silently reject (return false for add operations)
                    return;
                case "grow":
                    // Allow growth (do nothing, element will be added)
                    return;
                case "block":
                    throw new Error("Block policy not supported for sync collections");
                default:
                    throw new Error(`Unknown overflow policy: ${policy}`);
            }
        };
        return new Proxy(next, {
            get(target, prop, receiver) {
                // Capacity property
                if (prop === "capacity") {
                    return capacity;
                }
                // isFull property
                if (prop === "isFull") {
                    return target.size >= capacity;
                }
                // remainingCapacity property
                if (prop === "remainingCapacity") {
                    return Math.max(0, capacity - target.size);
                }
                const value = Reflect.get(target, prop, receiver);
                // Intercept methods that add elements
                if (typeof value === "function") {
                    switch (prop) {
                        case "add":
                            return function (element) {
                                if (target.size >= capacity && policy !== "grow") {
                                    handleOverflow(element);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return false;
                                    }
                                }
                                return value.call(target, element);
                            };
                        case "push":
                            return function (element) {
                                if (target.size >= capacity && policy !== "grow") {
                                    handleOverflow(element);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return;
                                    }
                                }
                                value.call(target, element);
                            };
                        case "unshift":
                            return function (element) {
                                if (target.size >= capacity && policy !== "grow") {
                                    handleOverflow(element);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return;
                                    }
                                    // For unshift with drop-oldest, we should drop from the end
                                    if (policy === "drop-oldest" && !target.isEmpty) {
                                        target.pop();
                                    }
                                }
                                value.call(target, element);
                            };
                        case "insert":
                            return function (index, element) {
                                if (target.size >= capacity && policy !== "grow") {
                                    handleOverflow(element);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return;
                                    }
                                }
                                value.call(target, index, element);
                            };
                        case "addAll":
                        case "insertAll":
                            return function (...args) {
                                const elements = args[args.length - 1];
                                const elementsArray = Array.from(elements);
                                // Check if adding all elements would exceed capacity
                                if (target.size + elementsArray.length > capacity && policy !== "grow") {
                                    // Add elements one by one with overflow handling
                                    let added = false;
                                    for (const element of elementsArray) {
                                        if (target.size >= capacity) {
                                            handleOverflow(element);
                                            if (policy === "reject" || policy === "drop-newest") {
                                                break;
                                            }
                                        }
                                        if (prop === "addAll") {
                                            target.add(element);
                                        }
                                        else {
                                            target.insert(args[0], element);
                                        }
                                        added = true;
                                    }
                                    return added;
                                }
                                return value.apply(target, args);
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates a bounded Queue middleware.
 */
export function boundedQueue(options) {
    const { capacity, policy = "throw", onOverflow } = options;
    return (next) => {
        const handleOverflow = (element) => {
            if (onOverflow) {
                const context = {
                    newElement: element,
                    currentSize: next.size,
                    capacity,
                    timestamp: Date.now(),
                };
                onOverflow(context);
            }
            switch (policy) {
                case "throw":
                    throw new Error(`Queue is full (capacity: ${capacity})`);
                case "drop-oldest":
                    if (!next.isEmpty) {
                        next.poll();
                    }
                    break;
                case "drop-newest":
                case "reject":
                    return;
                case "grow":
                    return;
                case "block":
                    throw new Error("Block policy not supported for sync collections");
                default:
                    throw new Error(`Unknown overflow policy: ${policy}`);
            }
        };
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "capacity")
                    return capacity;
                if (prop === "isFull")
                    return target.size >= capacity;
                if (prop === "remainingCapacity")
                    return Math.max(0, capacity - target.size);
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "offer":
                        case "enqueue":
                        case "add":
                            return function (element) {
                                if (target.size >= capacity && policy !== "grow") {
                                    handleOverflow(element);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return false;
                                    }
                                }
                                return value.call(target, element);
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates a bounded Deque middleware.
 */
export function boundedDeque(options) {
    const { capacity, policy = "throw", onOverflow } = options;
    return (next) => {
        const handleOverflow = (element) => {
            if (onOverflow) {
                const context = {
                    newElement: element,
                    currentSize: next.size,
                    capacity,
                    timestamp: Date.now(),
                };
                onOverflow(context);
            }
            switch (policy) {
                case "throw":
                    throw new Error(`Deque is full (capacity: ${capacity})`);
                case "drop-oldest":
                    if (!next.isEmpty) {
                        next.removeFirst();
                    }
                    break;
                case "drop-newest":
                case "reject":
                    return;
                case "grow":
                    return;
                case "block":
                    throw new Error("Block policy not supported for sync collections");
                default:
                    throw new Error(`Unknown overflow policy: ${policy}`);
            }
        };
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "capacity")
                    return capacity;
                if (prop === "isFull")
                    return target.size >= capacity;
                if (prop === "remainingCapacity")
                    return Math.max(0, capacity - target.size);
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "addFirst":
                        case "addLast":
                        case "offerFirst":
                        case "offerLast":
                        case "push":
                        case "offer":
                        case "add":
                            return function (element) {
                                if (target.size >= capacity && policy !== "grow") {
                                    handleOverflow(element);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return prop.startsWith("offer") || prop === "add" ? false : undefined;
                                    }
                                }
                                return value.call(target, element);
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates a bounded Map middleware.
 */
export function boundedMap(options) {
    const { capacity, policy = "throw", onOverflow } = options;
    return (next) => {
        let insertionOrder = []; // Track insertion order for drop-oldest
        const handleOverflow = (key, value) => {
            if (onOverflow) {
                onOverflow({
                    key,
                    value,
                    currentSize: next.size,
                    capacity,
                    timestamp: Date.now(),
                });
            }
            switch (policy) {
                case "throw":
                    throw new Error(`Map is full (capacity: ${capacity})`);
                case "drop-oldest":
                    // Remove oldest key
                    if (insertionOrder.length > 0) {
                        const oldestKey = insertionOrder.shift();
                        next.delete(oldestKey);
                    }
                    break;
                case "drop-newest":
                case "reject":
                    return;
                case "grow":
                    return;
                case "block":
                    throw new Error("Block policy not supported for sync collections");
                default:
                    throw new Error(`Unknown overflow policy: ${policy}`);
            }
        };
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "capacity")
                    return capacity;
                if (prop === "isFull")
                    return target.size >= capacity;
                if (prop === "remainingCapacity")
                    return Math.max(0, capacity - target.size);
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "set":
                            return function (key, val) {
                                const hadKey = target.has(key);
                                if (!hadKey && target.size >= capacity && policy !== "grow") {
                                    handleOverflow(key, val);
                                    if (policy === "reject" || policy === "drop-newest") {
                                        return undefined;
                                    }
                                }
                                const result = value.call(target, key, val);
                                // Track insertion order
                                if (!hadKey) {
                                    insertionOrder.push(key);
                                }
                                return result;
                            };
                        case "delete":
                            return function (key) {
                                const result = value.call(target, key);
                                // Remove from insertion order tracking
                                insertionOrder = insertionOrder.filter((k) => !target.keyEq(k, key));
                                return result;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                insertionOrder = [];
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Generic bounded collection middleware.
 * Works with any collection type.
 */
export function bounded(options) {
    return boundedList(options);
}
//# sourceMappingURL=bounded.js.map