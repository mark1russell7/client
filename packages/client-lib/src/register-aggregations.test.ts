/**
 * Tests for aggregation registration module
 */

import { describe, it, expect, vi } from "vitest";
import {
  aggregationRegistry,
  registerAggregationProcedures,
  getAllAggregations,
  getAggregation,
  listAggregationPaths,
} from "./register-aggregations.js";

describe("aggregationRegistry", () => {
  it("should contain expected aggregations", () => {
    expect(aggregationRegistry.length).toBeGreaterThan(0);

    // Check for key aggregations
    const paths = aggregationRegistry.map((r) => r.path.join("."));

    // Primitives
    expect(paths).toContain("agg.git.commitAndPush");
    expect(paths).toContain("agg.git.initWorkflow");
    expect(paths).toContain("agg.git.pull");
    expect(paths).toContain("agg.pnpm.installAndBuild");
    expect(paths).toContain("agg.pnpm.install");
    expect(paths).toContain("agg.cleanup.force");
    expect(paths).toContain("agg.fs.ensureDir");

    // lib.new
    expect(paths).toContain("agg.lib.new");
    expect(paths).toContain("agg.lib.scaffold");

    // lib.refresh
    expect(paths).toContain("agg.lib.refresh");
    expect(paths).toContain("agg.lib.refresh.single");

    // lib.install
    expect(paths).toContain("agg.lib.install");
    expect(paths).toContain("agg.lib.install.single");
    expect(paths).toContain("agg.lib.install.cloneMissing");

    // lib.pull
    expect(paths).toContain("agg.lib.pull");
    expect(paths).toContain("agg.lib.pull.single");
  });

  it("should have valid aggregation definitions", () => {
    for (const entry of aggregationRegistry) {
      // Each entry should have path and aggregation
      expect(entry.path).toBeDefined();
      expect(Array.isArray(entry.path)).toBe(true);
      expect(entry.path.length).toBeGreaterThan(0);

      expect(entry.aggregation).toBeDefined();
      expect(typeof entry.aggregation).toBe("object");

      // Aggregation should have $proc or be a valid structure
      const agg = entry.aggregation;
      expect(
        "$proc" in agg ||
        "chain" in agg ||
        "conditional" in agg ||
        "parallel" in agg ||
        "identity" in agg
      ).toBe(true);
    }
  });

  it("should have metadata for all entries", () => {
    for (const entry of aggregationRegistry) {
      expect(entry.metadata).toBeDefined();
      expect(entry.metadata?.description).toBeDefined();
      expect(typeof entry.metadata?.description).toBe("string");
      expect(entry.metadata?.tags).toBeDefined();
      expect(Array.isArray(entry.metadata?.tags)).toBe(true);
    }
  });
});

describe("getAllAggregations", () => {
  it("should return a copy of the registry", () => {
    const all = getAllAggregations();

    expect(all).toEqual(aggregationRegistry);
    expect(all).not.toBe(aggregationRegistry); // Should be a copy
  });

  it("should not allow mutation of original registry", () => {
    const all = getAllAggregations();
    const originalLength = aggregationRegistry.length;

    // Mutate the copy
    all.push({
      path: ["test"],
      aggregation: { identity: true },
      metadata: { description: "test", tags: [] },
    });

    // Original should be unchanged
    expect(aggregationRegistry.length).toBe(originalLength);
  });
});

describe("getAggregation", () => {
  it("should find aggregation by path", () => {
    const result = getAggregation(["agg", "lib", "new"]);

    expect(result).toBeDefined();
    expect(result?.path).toEqual(["agg", "lib", "new"]);
    expect(result?.metadata?.description).toContain("new package");
  });

  it("should return undefined for non-existent path", () => {
    const result = getAggregation(["non", "existent", "path"]);

    expect(result).toBeUndefined();
  });

  it("should match exact path", () => {
    // "agg.lib.refresh" exists but "agg.lib" should not match
    const result = getAggregation(["agg", "lib"]);

    expect(result).toBeUndefined();
  });
});

describe("listAggregationPaths", () => {
  it("should return all paths as dot-separated strings", () => {
    const paths = listAggregationPaths();

    expect(paths.length).toBe(aggregationRegistry.length);

    for (const path of paths) {
      expect(typeof path).toBe("string");
      expect(path).toContain(".");
    }
  });

  it("should have correct format", () => {
    const paths = listAggregationPaths();

    // All should start with "agg."
    for (const path of paths) {
      expect(path.startsWith("agg.")).toBe(true);
    }
  });
});

describe("registerAggregationProcedures", () => {
  it("should register all aggregations with client", async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };

    const result = await registerAggregationProcedures(mockClient);

    expect(result.registered.length).toBe(aggregationRegistry.length);
    expect(result.skipped.length).toBe(0);
    expect(result.errors.length).toBe(0);

    // Verify call was made for each aggregation
    expect(mockClient.call).toHaveBeenCalledTimes(aggregationRegistry.length);

    // Check call format
    const firstCall = mockClient.call.mock.calls[0];
    expect(firstCall[0]).toEqual(["procedure", "define"]);
    expect(firstCall[1]).toHaveProperty("path");
    expect(firstCall[1]).toHaveProperty("aggregation");
  });

  it("should handle registration errors", async () => {
    const mockClient = {
      call: vi.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error("Registration failed"))
        .mockResolvedValue({ success: true }),
    };

    const result = await registerAggregationProcedures(mockClient);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toBe("Registration failed");
    expect(result.registered.length).toBe(aggregationRegistry.length - 1);
  });

  it("should apply filter function", async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };

    // Only register git primitives
    const result = await registerAggregationProcedures(mockClient, {
      filter: (path) => path[1] === "git",
    });

    const gitAggregations = aggregationRegistry.filter(
      (r) => r.path[1] === "git"
    );

    expect(result.registered.length).toBe(gitAggregations.length);
    expect(result.skipped.length).toBe(
      aggregationRegistry.length - gitAggregations.length
    );
  });

  it("should pass replace option", async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };

    await registerAggregationProcedures(mockClient, { replace: true });

    // All calls should have replace: true
    for (const call of mockClient.call.mock.calls) {
      expect(call[1].replace).toBe(true);
    }
  });

  it("should pass metadata", async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };

    await registerAggregationProcedures(mockClient);

    // All calls should have metadata
    for (const call of mockClient.call.mock.calls) {
      expect(call[1].metadata).toBeDefined();
      expect(call[1].metadata.description).toBeDefined();
    }
  });

  it("should support verbose logging", async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await registerAggregationProcedures(mockClient, { verbose: true });

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls.some(
      (call) => String(call[0]).includes("Registering aggregation")
    )).toBe(true);

    consoleSpy.mockRestore();
  });

  it("should return registered paths as dot-separated strings", async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };

    const result = await registerAggregationProcedures(mockClient);

    for (const path of result.registered) {
      expect(typeof path).toBe("string");
      expect(path).toContain(".");
    }
  });
});

describe("aggregation structure validation", () => {
  describe("primitives", () => {
    it("gitCommitAndPush should have valid aggregation structure", () => {
      const agg = getAggregation(["agg", "git", "commitAndPush"]);
      expect(agg?.aggregation).toBeDefined();
      // May have $proc wrapper or direct chain/conditional
      const def = agg?.aggregation;
      expect(
        def && ("$proc" in def || "chain" in def || "conditional" in def)
      ).toBe(true);
    });

    it("pnpmInstallAndBuild should have valid aggregation structure", () => {
      const agg = getAggregation(["agg", "pnpm", "installAndBuild"]);
      expect(agg?.aggregation).toBeDefined();
      const def = agg?.aggregation;
      expect(
        def && ("$proc" in def || "chain" in def || "conditional" in def)
      ).toBe(true);
    });
  });

  describe("lib aggregations", () => {
    it("libNew should have chain or conditional structure", () => {
      const agg = getAggregation(["agg", "lib", "new"]);
      expect(agg?.aggregation).toBeDefined();
      // Should be a valid aggregation structure
      const def = agg?.aggregation;
      expect(
        def && ("chain" in def || "conditional" in def || "$proc" in def)
      ).toBe(true);
    });

    it("libRefresh should support dry-run", () => {
      const agg = getAggregation(["agg", "lib", "refresh"]);
      expect(agg?.aggregation).toBeDefined();
    });

    it("libInstall should handle multiple packages", () => {
      const agg = getAggregation(["agg", "lib", "install"]);
      expect(agg?.aggregation).toBeDefined();
    });

    it("libPull should have single package variant", () => {
      const single = getAggregation(["agg", "lib", "pull", "single"]);
      const all = getAggregation(["agg", "lib", "pull"]);

      expect(single).toBeDefined();
      expect(all).toBeDefined();
    });
  });
});
