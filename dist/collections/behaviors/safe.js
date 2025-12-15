/**
 * Safe behavior - Provides Option/Result-based error handling.
 *
 * Wraps collection operations that throw errors to instead return
 * Option<T> or Result<T, E>, enabling functional error handling.
 *
 * @example
 * const list = compose(
 *   safeList()
 * )(arrayList<number>())
 *
 * const value = list.safe.get(10) // Option<number> instead of throwing
 * if (isSome(value)) {
 *   console.log(value.value)
 * }
 */
import {} from "../core/effects.js";
import { None, Some, tryCatch } from "../core/effects.js";
/**
 * Creates a safe List middleware.
 *
 * Exposes a `safe` property with Option/Result-based operations.
 */
export function safeList() {
    return (next) => {
        const safe = {
            get(index) {
                return tryCatch(() => next.get(index), () => "Index out of bounds").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
            set(index, element) {
                return tryCatch(() => next.set(index, element), (error) => String(error));
            },
            removeAt(index) {
                return tryCatch(() => next.removeAt(index), (error) => String(error));
            },
            first() {
                return next.isEmpty ? None : Some(next.first());
            },
            last() {
                return next.isEmpty ? None : Some(next.last());
            },
            pop() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.pop(), () => "List is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
            shift() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.shift(), () => "List is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
        };
        // Extend next with safe property
        return Object.assign(next, { safe });
    };
}
/**
 * Creates a safe Queue middleware.
 */
export function safeQueue() {
    return (next) => {
        const safe = {
            peek() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.peek(), () => "Queue is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
            poll() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.poll(), () => "Queue is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
            dequeue() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.dequeue(), () => "Queue is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
        };
        return Object.assign(next, { safe });
    };
}
/**
 * Creates a safe Deque middleware.
 */
export function safeDeque() {
    return (next) => {
        const safe = {
            peek() {
                return next.isEmpty ? None : Some(next.peekFirst());
            },
            poll() {
                return next.pollFirst() !== undefined ? Some(next.pollFirst()) : None;
            },
            dequeue() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.dequeue(), () => "Deque is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
            peekFirst() {
                return next.isEmpty ? None : Some(next.peekFirst());
            },
            peekLast() {
                return next.isEmpty ? None : Some(next.peekLast());
            },
            pollFirst() {
                const result = next.pollFirst();
                return result !== undefined ? Some(result) : None;
            },
            pollLast() {
                const result = next.pollLast();
                return result !== undefined ? Some(result) : None;
            },
            pop() {
                if (next.isEmpty)
                    return None;
                return tryCatch(() => next.pop(), () => "Deque is empty").match({
                    Ok: (value) => Some(value),
                    Err: () => None,
                });
            },
        };
        return Object.assign(next, { safe });
    };
}
/**
 * Creates a safe Map middleware.
 */
export function safeMap() {
    return (next) => {
        const safe = {
            get(key) {
                return next.has(key) ? Some(next.get(key)) : None;
            },
            set(key, value) {
                return tryCatch(() => next.set(key, value), (error) => String(error));
            },
            delete(key) {
                return tryCatch(() => next.delete(key), (error) => String(error));
            },
        };
        return Object.assign(next, { safe });
    };
}
/**
 * Generic safe middleware that works with any collection.
 */
export function safe() {
    // Return as-is for now; specialized versions handle specific types
    return (next) => next;
}
//# sourceMappingURL=safe.js.map