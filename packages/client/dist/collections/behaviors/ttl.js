/**
 * TTL (Time-To-Live) expiration behavior.
 *
 * Automatically expires elements after a specified time period.
 * Perfect for temporary caches and time-limited data.
 *
 * @example
 * const cache = compose(
 *   ttlMap({ ttl: 60000 }) // 60 seconds
 * )(hashMap<string, Data>())
 *
 * cache.set('key', data)
 * // After 60 seconds, 'key' is automatically removed
 */
/**
 * Creates a TTL Map middleware.
 *
 * Automatically removes entries after TTL expires.
 * Uses a background interval to check for expired entries.
 */
export function ttlMap(options) {
    const { ttl, checkInterval = 1000, onExpire } = options;
    return (next) => {
        const metadata = new Map();
        let intervalId = null;
        const checkExpired = () => {
            const now = Date.now();
            const expired = [];
            for (const [key, entry] of metadata) {
                if (now >= entry.expiresAt) {
                    expired.push(key);
                }
            }
            for (const key of expired) {
                const entry = metadata.get(key);
                if (entry) {
                    next.delete(key);
                    metadata.delete(key);
                    if (onExpire) {
                        onExpire({
                            key,
                            value: entry.value,
                            createdAt: entry.createdAt,
                            expiredAt: now,
                        });
                    }
                }
            }
        };
        // Start background expiration checker
        intervalId = setInterval(checkExpired, checkInterval);
        const dispose = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };
        return new Proxy(next, {
            get(target, prop, receiver) {
                // Add dispose method
                if (prop === "dispose") {
                    return dispose;
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "get":
                            return function (key) {
                                // Check if expired before returning
                                const entry = metadata.get(key);
                                if (entry && Date.now() >= entry.expiresAt) {
                                    target.delete(key);
                                    metadata.delete(key);
                                    throw new Error(`Key expired: ${key}`);
                                }
                                return value.call(target, key);
                            };
                        case "has":
                            return function (key) {
                                // Check if expired
                                const entry = metadata.get(key);
                                if (entry && Date.now() >= entry.expiresAt) {
                                    target.delete(key);
                                    metadata.delete(key);
                                    return false;
                                }
                                return value.call(target, key);
                            };
                        case "set":
                            return function (key, val) {
                                const now = Date.now();
                                const result = value.call(target, key, val);
                                metadata.set(key, {
                                    value: val,
                                    expiresAt: now + ttl,
                                    createdAt: now,
                                });
                                return result;
                            };
                        case "delete":
                            return function (key) {
                                const result = value.call(target, key);
                                metadata.delete(key);
                                return result;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                metadata.clear();
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Creates a TTL Collection middleware.
 *
 * Note: This is less precise than TTL map because collections don't have keys.
 * Elements are tracked by reference, which may not work for primitive types.
 */
export function ttlCollection(options) {
    const { ttl, checkInterval = 1000, onExpire } = options;
    return (next) => {
        const metadata = new Map();
        let intervalId = null;
        const checkExpired = () => {
            const now = Date.now();
            const expired = [];
            for (const [element, entry] of metadata) {
                if (now >= entry.expiresAt) {
                    expired.push(element);
                }
            }
            for (const element of expired) {
                const entry = metadata.get(element);
                if (entry) {
                    next.remove(element);
                    metadata.delete(element);
                    if (onExpire) {
                        onExpire({
                            element,
                            createdAt: entry.createdAt,
                            expiredAt: now,
                        });
                    }
                }
            }
        };
        intervalId = setInterval(checkExpired, checkInterval);
        const dispose = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };
        return new Proxy(next, {
            get(target, prop, receiver) {
                if (prop === "dispose") {
                    return dispose;
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value === "function") {
                    switch (prop) {
                        case "add":
                            return function (element) {
                                const result = value.call(target, element);
                                if (result) {
                                    const now = Date.now();
                                    metadata.set(element, {
                                        expiresAt: now + ttl,
                                        createdAt: now,
                                    });
                                }
                                return result;
                            };
                        case "remove":
                            return function (element) {
                                const result = value.call(target, element);
                                if (result) {
                                    metadata.delete(element);
                                }
                                return result;
                            };
                        case "clear":
                            return function () {
                                value.call(target);
                                metadata.clear();
                            };
                    }
                }
                return value;
            },
        });
    };
}
/**
 * Standalone TTL cache with Map-like API.
 *
 * @example
 * const cache = new TTLCache<string, number>(60000) // 60 second TTL
 * cache.set('key', 42)
 * setTimeout(() => {
 *   cache.get('key') // undefined (expired)
 * }, 61000)
 */
export class TTLCache {
    ttl;
    checkInterval;
    onExpire;
    map = new Map();
    intervalId = null;
    constructor(ttl, checkInterval = 1000, onExpire) {
        this.ttl = ttl;
        this.checkInterval = checkInterval;
        this.onExpire = onExpire;
        this.startExpirationCheck();
    }
    get size() {
        this.cleanup();
        return this.map.size;
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        if (Date.now() >= entry.expiresAt) {
            this.map.delete(key);
            if (this.onExpire) {
                this.onExpire(key, entry.value);
            }
            return undefined;
        }
        return entry.value;
    }
    set(key, value, customTTL) {
        const now = Date.now();
        const ttlToUse = customTTL !== undefined ? customTTL : this.ttl;
        this.map.set(key, {
            value,
            expiresAt: now + ttlToUse,
            createdAt: now,
        });
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        return this.map.delete(key);
    }
    clear() {
        this.map.clear();
    }
    /**
     * Manually trigger cleanup of expired entries.
     */
    cleanup() {
        const now = Date.now();
        const expired = [];
        for (const [key, entry] of this.map) {
            if (now >= entry.expiresAt) {
                expired.push(key);
            }
        }
        for (const key of expired) {
            const entry = this.map.get(key);
            if (entry) {
                this.map.delete(key);
                if (this.onExpire) {
                    this.onExpire(key, entry.value);
                }
            }
        }
    }
    /**
     * Get remaining TTL for a key in milliseconds.
     * Returns undefined if key doesn't exist or is expired.
     */
    getTTL(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        const remaining = entry.expiresAt - Date.now();
        return remaining > 0 ? remaining : undefined;
    }
    /**
     * Update TTL for an existing key.
     */
    touch(key, customTTL) {
        const entry = this.map.get(key);
        if (!entry)
            return false;
        if (Date.now() >= entry.expiresAt) {
            this.map.delete(key);
            return false;
        }
        const ttlToUse = customTTL !== undefined ? customTTL : this.ttl;
        entry.expiresAt = Date.now() + ttlToUse;
        return true;
    }
    startExpirationCheck() {
        this.intervalId = setInterval(() => this.cleanup(), this.checkInterval);
    }
    /**
     * Stop the background expiration checker and clean up.
     */
    dispose() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    *keys() {
        this.cleanup();
        yield* this.map.keys();
    }
    *values() {
        this.cleanup();
        for (const entry of this.map.values()) {
            yield entry.value;
        }
    }
    *entries() {
        this.cleanup();
        for (const [key, entry] of this.map) {
            yield [key, entry.value];
        }
    }
}
/**
 * Factory function to create a TTL cache.
 */
export function ttlCache(ttl, options) {
    return new TTLCache(ttl, options?.checkInterval, options?.onExpire);
}
//# sourceMappingURL=ttl.js.map