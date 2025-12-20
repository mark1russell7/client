import { describe, it, expect, vi } from "vitest";
import { executeDAG, executeDAGSequential, createProcessor } from "../executor.js";
import { buildLeveledDAG } from "../traversal.js";
import { createNode, buildNodeMap } from "../builder.js";
import type { DAGNode, NodeResult } from "../../types.js";

function createSuccessResult(node: DAGNode): NodeResult<DAGNode> {
  return {
    node,
    success: true,
    duration: 10,
    logs: ["Success"],
  };
}

function createFailureResult(node: DAGNode, message: string): NodeResult<DAGNode> {
  return {
    node,
    success: false,
    error: new Error(message),
    duration: 10,
    logs: ["Failed: " + message],
  };
}

describe("executeDAG", () => {
  it("executes all nodes successfully", async () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const processor = vi.fn(async (node: DAGNode) => createSuccessResult(node));

    const result = await executeDAG(dag, processor);

    expect(result.success).toBe(true);
    expect(result.failedNodes).toHaveLength(0);
    expect(result.results.size).toBe(3);
    expect(processor).toHaveBeenCalledTimes(3);
  });

  it("respects topological order", async () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const executionOrder: string[] = [];
    const processor = vi.fn(async (node: DAGNode) => {
      executionOrder.push(node.id);
      return createSuccessResult(node);
    });

    await executeDAG(dag, processor, { concurrency: 1 });

    expect(executionOrder).toEqual(["a", "b", "c"]);
  });

  it("stops on first failure with failFast=true", async () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b", ["a"]),
      createNode("c", ["b"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const processor = vi.fn(async (node: DAGNode) => {
      if (node.id === "b") {
        return createFailureResult(node, "b failed");
      }
      return createSuccessResult(node);
    });

    const result = await executeDAG(dag, processor, { failFast: true });

    expect(result.success).toBe(false);
    expect(result.failedNodes).toContain("b");
  });

  it("continues on failure with failFast=false", async () => {
    // a and b are independent leaves, c depends on both
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b"),
      createNode("c", ["a", "b"]),
    ]);

    const dag = buildLeveledDAG(nodes);
    const processor = vi.fn(async (node: DAGNode) => {
      if (node.id === "a") {
        return createFailureResult(node, "a failed");
      }
      return createSuccessResult(node);
    });

    const result = await executeDAG(dag, processor, { failFast: false });

    expect(result.success).toBe(false);
    expect(result.failedNodes).toEqual(["a"]);
    expect(result.results.size).toBe(3);
  });

  it("calls onNodeStart callback", async () => {
    const nodes = buildNodeMap([createNode("a")]);
    const dag = buildLeveledDAG(nodes);
    const onNodeStart = vi.fn();

    await executeDAG(dag, async (node) => createSuccessResult(node), { onNodeStart });

    expect(onNodeStart).toHaveBeenCalledWith(nodes.get("a"));
  });

  it("calls onNodeComplete callback", async () => {
    const nodes = buildNodeMap([createNode("a")]);
    const dag = buildLeveledDAG(nodes);
    const onNodeComplete = vi.fn();

    await executeDAG(dag, async (node) => createSuccessResult(node), { onNodeComplete });

    expect(onNodeComplete).toHaveBeenCalled();
    const callArg = onNodeComplete.mock.calls[0][0] as NodeResult<DAGNode>;
    expect(callArg.node.id).toBe("a");
  });

  it("respects concurrency limit", async () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b"),
      createNode("c"),
      createNode("d"),
    ]);

    const dag = buildLeveledDAG(nodes);
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const processor = vi.fn(async (node: DAGNode) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentConcurrent--;
      return createSuccessResult(node);
    });

    await executeDAG(dag, processor, { concurrency: 2 });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("tracks total duration", async () => {
    const nodes = buildNodeMap([createNode("a")]);
    const dag = buildLeveledDAG(nodes);

    const result = await executeDAG(dag, async (node) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return createSuccessResult(node);
    });

    expect(result.totalDuration).toBeGreaterThanOrEqual(50);
  });
});

describe("executeDAGSequential", () => {
  it("executes nodes one at a time", async () => {
    const nodes = buildNodeMap([
      createNode("a"),
      createNode("b"),
      createNode("c"),
    ]);

    const dag = buildLeveledDAG(nodes);
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const processor = vi.fn(async (node: DAGNode) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return createSuccessResult(node);
    });

    await executeDAGSequential(dag, processor);

    expect(maxConcurrent).toBe(1);
  });
});

describe("createProcessor", () => {
  it("wraps async function with success result", async () => {
    const fn = vi.fn(async () => {});
    const processor = createProcessor(fn);
    const node = createNode("test");

    const result = await processor(node);

    expect(result.success).toBe(true);
    expect(result.node).toBe(node);
    expect(result.logs).toContain("Starting test");
    expect(result.logs).toContain("Completed test");
    expect(fn).toHaveBeenCalledWith(node);
  });

  it("wraps async function with failure result on error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("Test error");
    });
    const processor = createProcessor(fn);
    const node = createNode("test");

    const result = await processor(node);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("Test error");
    expect(result.logs).toContain("Failed test: Test error");
  });

  it("handles non-Error throws", async () => {
    const fn = vi.fn(async () => {
      throw "string error";
    });
    const processor = createProcessor(fn);
    const node = createNode("test");

    const result = await processor(node);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("string error");
  });

  it("tracks duration", async () => {
    const fn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const processor = createProcessor(fn);
    const node = createNode("test");

    const result = await processor(node);

    expect(result.duration).toBeGreaterThanOrEqual(50);
  });
});
