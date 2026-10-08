/**
 * General test utilities
 */

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
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
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture console output during a test
 */
export interface CapturedOutput {
  stdout: string[];
  stderr: string[];
}

export function captureOutput(
  fn: () => void | Promise<void>
): Promise<CapturedOutput> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
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
export async function assertThrows(
  fn: () => void | Promise<void>,
  expectedMessage?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error("Expected function to throw");
  } catch (error) {
    if (error instanceof Error && error.message === "Expected function to throw") {
      throw error;
    }
    if (expectedMessage !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof expectedMessage === "string") {
        if (!message.includes(expectedMessage)) {
          throw new Error(
            `Expected error message to include "${expectedMessage}", got "${message}"`
          );
        }
      } else if (!expectedMessage.test(message)) {
        throw new Error(
          `Expected error message to match ${expectedMessage}, got "${message}"`
        );
      }
    }
    return error as Error;
  }
}

/**
 * Create a deferred promise for async testing
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Run a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  message = "Operation timed out"
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    }),
  ]);
}
