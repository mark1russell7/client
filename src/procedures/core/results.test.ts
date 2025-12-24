/**
 * Unit tests for aggregation result types and utilities
 */

import { describe, it, expect } from "vitest";
import {
  successResult,
  errorResult,
  createChainResult,
  createParallelResult,
  createMapResult,
  isSuccess,
  isError,
  unwrap,
  unwrapOr,
  mapResult,
  type StepResult,
  type ChainResult,
  type ParallelResult,
  type MapResult,
} from "./results.js";

describe("successResult", () => {
  it("creates success result with value and duration", () => {
    const result = successResult({ id: 1, name: "test" }, 42);

    expect(result.success).toBe(true);
    expect(result.value).toEqual({ id: 1, name: "test" });
    expect(result.duration).toBe(42);
  });

  it("handles primitive values", () => {
    expect(successResult(42, 10).value).toBe(42);
    expect(successResult("hello", 10).value).toBe("hello");
    expect(successResult(true, 10).value).toBe(true);
    expect(successResult(null, 10).value).toBeNull();
  });

  it("handles zero duration", () => {
    const result = successResult("fast", 0);

    expect(result.duration).toBe(0);
  });
});

describe("errorResult", () => {
  it("creates failure result with string error", () => {
    const result = errorResult<number>("Something went wrong", 100);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Something went wrong");
    expect(result.duration).toBe(100);
  });

  it("creates failure result with Error object", () => {
    const result = errorResult<number>(new Error("Connection timeout"), 5000);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection timeout");
    expect(result.duration).toBe(5000);
  });

  it("preserves error message from Error object", () => {
    const error = new TypeError("Invalid type");
    const result = errorResult<string>(error, 10);

    expect(result.error).toBe("Invalid type");
  });
});

describe("createChainResult", () => {
  it("creates chain result from successful steps", () => {
    const steps: StepResult<unknown>[] = [
      successResult({ step: 1 }, 100),
      successResult({ step: 2 }, 50),
      successResult({ step: 3 }, 75),
    ];

    const result = createChainResult(steps);

    expect(result.success).toBe(true);
    expect(result.final).toEqual({ step: 3 });
    expect(result.duration).toBe(225);
    expect(result.results).toHaveLength(3);
  });

  it("marks as failed if any step failed", () => {
    const steps: StepResult<unknown>[] = [
      successResult("ok", 10),
      errorResult("failed", 20),
      successResult("also ok", 30),
    ];

    const result = createChainResult(steps);

    expect(result.success).toBe(false);
    // Note: final still returns last step's value if it succeeded
    // success=false indicates the chain had errors, but final is still populated
    expect(result.final).toBe("also ok");
  });

  it("handles empty steps array", () => {
    const result = createChainResult([]);

    expect(result.success).toBe(true);
    expect(result.final).toBeUndefined();
    expect(result.duration).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("returns undefined final when last step failed", () => {
    const steps: StepResult<unknown>[] = [
      successResult("first", 10),
      errorResult("last failed", 20),
    ];

    const result = createChainResult(steps);

    expect(result.final).toBeUndefined();
  });

  it("sums durations correctly", () => {
    const steps: StepResult<unknown>[] = [
      successResult(1, 100),
      successResult(2, 200),
      successResult(3, 300),
    ];

    const result = createChainResult(steps);

    expect(result.duration).toBe(600);
  });
});

describe("createParallelResult", () => {
  it("creates parallel result from all successful tasks", () => {
    const tasks: StepResult<string>[] = [
      successResult("task1", 100),
      successResult("task2", 50),
      successResult("task3", 150),
    ];

    const result = createParallelResult(tasks);

    expect(result.allSucceeded).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBe(150); // Max of all durations
    expect(result.results).toHaveLength(3);
  });

  it("collects errors with indices", () => {
    const tasks: StepResult<string>[] = [
      successResult("ok", 10),
      errorResult("first error", 20),
      successResult("also ok", 30),
      errorResult("second error", 40),
    ];

    const result = createParallelResult(tasks);

    expect(result.allSucceeded).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({ index: 1, error: "first error" });
    expect(result.errors[1]).toEqual({ index: 3, error: "second error" });
  });

  it("handles empty tasks array", () => {
    const result = createParallelResult([]);

    expect(result.allSucceeded).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBe(0);
  });

  it("uses max duration for parallel execution", () => {
    const tasks: StepResult<number>[] = [
      successResult(1, 500),
      successResult(2, 1000),
      successResult(3, 300),
    ];

    const result = createParallelResult(tasks);

    expect(result.duration).toBe(1000);
  });

  it("handles all failed tasks", () => {
    const tasks: StepResult<number>[] = [
      errorResult("err1", 10),
      errorResult("err2", 20),
    ];

    const result = createParallelResult(tasks);

    expect(result.allSucceeded).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

describe("createMapResult", () => {
  it("creates map result from all successful items", () => {
    const items: StepResult<number>[] = [
      successResult(1, 10),
      successResult(2, 20),
      successResult(3, 30),
    ];

    const result = createMapResult(items);

    expect(result.allSucceeded).toBe(true);
    expect(result.values).toEqual([1, 2, 3]);
    expect(result.duration).toBe(60);
  });

  it("filters out failed items from values", () => {
    const items: StepResult<string>[] = [
      successResult("a", 10),
      errorResult("failed", 20),
      successResult("c", 30),
    ];

    const result = createMapResult(items);

    expect(result.allSucceeded).toBe(false);
    expect(result.values).toEqual(["a", "c"]);
    expect(result.items).toHaveLength(3);
  });

  it("handles empty items array", () => {
    const result = createMapResult([]);

    expect(result.allSucceeded).toBe(true);
    expect(result.values).toEqual([]);
    expect(result.duration).toBe(0);
  });

  it("handles all failed items", () => {
    const items: StepResult<number>[] = [
      errorResult("err1", 10),
      errorResult("err2", 20),
    ];

    const result = createMapResult(items);

    expect(result.allSucceeded).toBe(false);
    expect(result.values).toEqual([]);
  });

  it("sums durations for total processing time", () => {
    const items: StepResult<number>[] = [
      successResult(1, 100),
      successResult(2, 200),
    ];

    const result = createMapResult(items);

    expect(result.duration).toBe(300);
  });
});

describe("isSuccess type guard", () => {
  it("returns true for success result", () => {
    const result = successResult(42, 10);

    expect(isSuccess(result)).toBe(true);
  });

  it("returns false for error result", () => {
    const result = errorResult<number>("error", 10);

    expect(isSuccess(result)).toBe(false);
  });

  it("narrows type correctly", () => {
    const result: StepResult<number> = successResult(42, 10);

    if (isSuccess(result)) {
      // TypeScript should know result.value exists
      const value: number = result.value;
      expect(value).toBe(42);
    }
  });
});

describe("isError type guard", () => {
  it("returns true for error result", () => {
    const result = errorResult<number>("error", 10);

    expect(isError(result)).toBe(true);
  });

  it("returns false for success result", () => {
    const result = successResult(42, 10);

    expect(isError(result)).toBe(false);
  });

  it("narrows type correctly", () => {
    const result: StepResult<number> = errorResult("oops", 10);

    if (isError(result)) {
      // TypeScript should know result.error exists
      const error: string = result.error;
      expect(error).toBe("oops");
    }
  });
});

describe("unwrap", () => {
  it("returns value for success result", () => {
    const result = successResult({ data: "test" }, 10);

    expect(unwrap(result)).toEqual({ data: "test" });
  });

  it("throws for error result", () => {
    const result = errorResult<number>("Something failed", 10);

    expect(() => unwrap(result)).toThrow("Something failed");
  });

  it("preserves value type", () => {
    const result = successResult([1, 2, 3], 10);
    const value = unwrap(result);

    expect(Array.isArray(value)).toBe(true);
    expect(value).toEqual([1, 2, 3]);
  });
});

describe("unwrapOr", () => {
  it("returns value for success result", () => {
    const result = successResult(42, 10);

    expect(unwrapOr(result, 0)).toBe(42);
  });

  it("returns default for error result", () => {
    const result = errorResult<number>("error", 10);

    expect(unwrapOr(result, 99)).toBe(99);
  });

  it("works with null as default", () => {
    const result = errorResult<string | null>("error", 10);

    expect(unwrapOr(result, null)).toBeNull();
  });

  it("preserves falsy values from success", () => {
    const result = successResult(0, 10);

    expect(unwrapOr(result, 100)).toBe(0);
  });
});

describe("mapResult", () => {
  it("transforms successful result value", () => {
    const result = successResult(5, 10);
    const mapped = mapResult(result, (n) => n * 2);

    expect(mapped.success).toBe(true);
    if (mapped.success) {
      expect(mapped.value).toBe(10);
    }
    expect(mapped.duration).toBe(10);
  });

  it("passes through error result unchanged", () => {
    const result = errorResult<number>("error", 20);
    const mapped = mapResult(result, (n) => n * 2);

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error).toBe("error");
    }
    expect(mapped.duration).toBe(20);
  });

  it("allows type transformation", () => {
    const result = successResult(42, 10);
    const mapped = mapResult(result, (n) => `Value: ${n}`);

    expect(mapped.success).toBe(true);
    if (mapped.success) {
      expect(mapped.value).toBe("Value: 42");
    }
  });

  it("handles complex transformations", () => {
    const result = successResult({ x: 1, y: 2 }, 10);
    const mapped = mapResult(result, (obj) => ({ sum: obj.x + obj.y }));

    if (mapped.success) {
      expect(mapped.value).toEqual({ sum: 3 });
    }
  });
});

describe("type safety", () => {
  it("StepResult discriminated union works", () => {
    const process = (result: StepResult<number>): string => {
      if (result.success) {
        return `Value: ${result.value}`;
      } else {
        return `Error: ${result.error}`;
      }
    };

    expect(process(successResult(42, 10))).toBe("Value: 42");
    expect(process(errorResult("oops", 10))).toBe("Error: oops");
  });

  it("ChainResult type is correct", () => {
    const chain: ChainResult<string> = {
      results: [successResult("a", 10)],
      final: "a",
      success: true,
      duration: 10,
    };

    expect(chain.final).toBe("a");
  });

  it("ParallelResult type is correct", () => {
    const parallel: ParallelResult<number> = {
      results: [successResult(1, 10)],
      allSucceeded: true,
      errors: [],
      duration: 10,
    };

    expect(parallel.allSucceeded).toBe(true);
  });

  it("MapResult type is correct", () => {
    const map: MapResult<string> = {
      items: [successResult("x", 10)],
      values: ["x"],
      allSucceeded: true,
      duration: 10,
    };

    expect(map.values).toEqual(["x"]);
  });
});
