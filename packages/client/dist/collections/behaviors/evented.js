/**
 * Evented behavior - Emits typed events on collection mutations.
 *
 * Wraps collections to emit events whenever elements are added, removed,
 * or the collection is cleared. Enables reactive programming patterns.
 *
 * @example
 * const list = compose(
 *   eventedList()
 * )(arrayList<number>())
 *
 * list.on('add', ({ value, index }) => {
 *   console.log(`Added ${value} at index ${index}`)
 * })
 *
 * list.add(42) // Triggers 'add' event
 */
import { Emitter } from "../core/events.js";
// ============================================================================
// Evented middleware implementations
// ============================================================================
/**
 * Creates an evented List middleware.
 *
 * Emits events for add, remove, set, clear, sort, and reverse operations.
 */
export function eventedList() {
    return (next) => {
        const emitter = new Emitter();
        return new Proxy(next, {
            get(target, prop, receiver) {
                // Expose event subscription
                if (prop === "on") {
                    return emitter.on.bind(emitter);
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "add":
                        case "push":
                            return function (element) {
                                const result = value.call(target, element);
                                emitter.emit("add", { value: element });
                                return result;
                            };
                        case "unshift":
                            return function (element) {
                                value.call(target, element);
                                emitter.emit("add", { value: element, index: 0 });
                            };
                        case "insert":
                            return function (index, element) {
                                value.call(target, index, element);
                                emitter.emit("add", { value: element, index });
                            };
                        case "set":
                            return function (index, element) {
                                const oldValue = value.call(target, index, element);
                                emitter.emit("set", { oldValue, newValue: element, index });
                                return oldValue;
                            };
                        case "remove":
                            return function (element) {
                                const result = value.call(target, element);
                                if (result) {
                                    emitter.emit("remove", { value: element });
                                }
                                return result;
                            };
                        case "removeAt":
                            return function (index) {
                                const removed = value.call(target, index);
                                emitter.emit("remove", { value: removed, index });
                                return removed;
                            };
                        case "pop":
                            return function () {
                                const removed = value.call(target);
                                emitter.emit("remove", { value: removed });
                                return removed;
                            };
                        case "shift":
                            return function () {
                                const removed = value.call(target);
                                emitter.emit("remove", { value: removed, index: 0 });
                                return removed;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                emitter.emit("clear", {});
                            };
                        case "sort":
                            return function (...args) {
                                value.apply(target, args);
                                emitter.emit("sort", {});
                            };
                        case "reverse":
                            return function () {
                                value.call(target);
                                emitter.emit("reverse", {});
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates an evented Queue middleware.
 */
export function eventedQueue() {
    return (next) => {
        const emitter = new Emitter();
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "on") {
                    return emitter.on.bind(emitter);
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "offer":
                        case "enqueue":
                        case "add":
                            return function (element) {
                                const result = value.call(target, element);
                                if (result !== false) {
                                    emitter.emit("enqueue", { value: element });
                                }
                                return result;
                            };
                        case "poll":
                        case "dequeue":
                            return function () {
                                const removed = value.call(target);
                                emitter.emit("dequeue", { value: removed });
                                return removed;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                emitter.emit("clear", {});
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates an evented Deque middleware.
 */
export function eventedDeque() {
    return (next) => {
        const emitter = new Emitter();
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "on") {
                    return emitter.on.bind(emitter);
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "addFirst":
                        case "offerFirst":
                        case "push":
                            return function (element) {
                                const result = value.call(target, element);
                                emitter.emit("addFirst", { value: element });
                                return result;
                            };
                        case "addLast":
                        case "offerLast":
                        case "offer":
                        case "add":
                            return function (element) {
                                const result = value.call(target, element);
                                emitter.emit("addLast", { value: element });
                                return result;
                            };
                        case "removeFirst":
                        case "pollFirst":
                        case "poll":
                        case "dequeue":
                            return function () {
                                const removed = value.call(target);
                                if (removed !== undefined) {
                                    emitter.emit("removeFirst", { value: removed });
                                }
                                return removed;
                            };
                        case "removeLast":
                        case "pollLast":
                        case "pop":
                            return function () {
                                const removed = value.call(target);
                                if (removed !== undefined) {
                                    emitter.emit("removeLast", { value: removed });
                                }
                                return removed;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                emitter.emit("clear", {});
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates an evented Map middleware.
 */
export function eventedMap() {
    return (next) => {
        const emitter = new Emitter();
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "on") {
                    return emitter.on.bind(emitter);
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "set":
                            return function (key, val) {
                                const oldValue = value.call(target, key, val);
                                emitter.emit("set", { key, value: val, oldValue });
                                return oldValue;
                            };
                        case "delete":
                            return function (key) {
                                const deletedValue = value.call(target, key);
                                if (deletedValue !== undefined) {
                                    emitter.emit("delete", { key, value: deletedValue });
                                }
                                return deletedValue;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                emitter.emit("clear", {});
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Generic evented collection middleware.
 */
export function evented() {
    return (next) => {
        const emitter = new Emitter();
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "on") {
                    return emitter.on.bind(emitter);
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "add":
                            return function (element) {
                                const result = value.call(target, element);
                                if (result) {
                                    emitter.emit("add", { value: element });
                                }
                                return result;
                            };
                        case "remove":
                            return function (element) {
                                const result = value.call(target, element);
                                if (result) {
                                    emitter.emit("remove", { value: element });
                                }
                                return result;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                emitter.emit("clear", {});
                            };
                    }
                }
                return value;
            },
        });
    };
}
//# sourceMappingURL=evented.js.map