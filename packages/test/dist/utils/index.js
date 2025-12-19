/**
 * General test utilities
 */
/**
 * Wait for a condition to be true
 */
export async function waitFor(condition, options = {}) {
    const { timeout = 5000, interval = 100 } = options;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await condition()) {
            return;
        }
        await sleep(interval);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
}
/**
 * Sleep for a specified duration
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function captureOutput(fn) {
    const stdout = [];
    const stderr = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => {
        stdout.push(args.map(String).join(" "));
    };
    console.error = (...args) => {
        stderr.push(args.map(String).join(" "));
    };
    return Promise.resolve(fn())
        .then(() => {
        console.log = originalLog;
        console.error = originalError;
        return { stdout, stderr };
    })
        .catch((error) => {
        console.log = originalLog;
        console.error = originalError;
        throw error;
    });
}
/**
 * Assert that a function throws with a specific message
 */
export async function assertThrows(fn, expectedMessage) {
    try {
        await fn();
        throw new Error("Expected function to throw");
    }
    catch (error) {
        if (error instanceof Error && error.message === "Expected function to throw") {
            throw error;
        }
        if (expectedMessage !== undefined) {
            const message = error instanceof Error ? error.message : String(error);
            if (typeof expectedMessage === "string") {
                if (!message.includes(expectedMessage)) {
                    throw new Error(`Expected error message to include "${expectedMessage}", got "${message}"`);
                }
            }
            else if (!expectedMessage.test(message)) {
                throw new Error(`Expected error message to match ${expectedMessage}, got "${message}"`);
            }
        }
        return error;
    }
}
export function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
/**
 * Run a function with a timeout
 */
export async function withTimeout(fn, timeout, message = "Operation timed out") {
    return Promise.race([
        fn(),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeout);
        }),
    ]);
}
//# sourceMappingURL=index.js.map