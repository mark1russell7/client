/**
 * The journey runs the real client, middlewares, server and interceptors. These tests check that
 * each host records the steps in the order that the code runs them.
 */

import { describe, it, expect } from "vitest";
import { HOSTS, lanesOf, runJourney, type Host, type JourneyStep } from "./journey";

const EXPECTED_ITEMS = ["Item 1: 2.50", "Item 2: 5.50", "Total with tax: 10.00"];

function firstIndex(steps: JourneyStep[], test: (step: JourneyStep) => boolean): number {
  const index = steps.findIndex(test);
  expect(index, "a step that the test needs").toBeGreaterThanOrEqual(0);
  return index;
}

describe("runJourney", () => {
  for (const { id } of HOSTS) {
    it(`gives the items and the steps of the ${id} host`, async () => {
      const journey = await runJourney(id as Host);
      expect(journey.ok, journey.error).toBe(true);
      expect(journey.items).toEqual(EXPECTED_ITEMS);
      // Each step is in a lane of the host
      const lanes = new Set(lanesOf(id as Host));
      for (const step of journey.steps) expect(lanes.has(step.lane), `${step.lane} in ${id}`).toBe(true);
      // The input is valid before the handler starts, and the nested calls run before the first item
      const validated = firstIndex(journey.steps, (step) => step.lane === "validation" && step.direction === "down");
      const started = firstIndex(journey.steps, (step) => step.lane === "handler" && step.title.includes("starts"));
      const nested = firstIndex(journey.steps, (step) => step.title.includes("calls client.sum"));
      const firstItem = firstIndex(journey.steps, (step) => step.lane === "handler" && step.item === 1);
      expect(validated).toBeLessThan(started);
      expect(started).toBeLessThan(nested);
      expect(nested).toBeLessThan(firstItem);
      // The app gets each item after the handler yields it
      for (let item = 1; item <= 3; item++) {
        const yielded = firstIndex(journey.steps, (step) => step.lane === "handler" && step.item === item);
        const got = firstIndex(journey.steps, (step) => step.lane === "app" && step.item === item);
        expect(yielded).toBeLessThan(got);
      }
      // The times do not go back
      for (let index = 1; index < journey.steps.length; index++) {
        expect(journey.steps[index]!.at).toBeGreaterThanOrEqual(journey.steps[index - 1]!.at);
      }
    });
  }

  it("runs the client middlewares from the outside in: retry, then the timeout of the attempt", async () => {
    const journey = await runJourney("http");
    const retry = firstIndex(journey.steps, (step) => step.lane === "retry");
    const timeout = firstIndex(journey.steps, (step) => step.lane === "timeout");
    const wire = firstIndex(journey.steps, (step) => step.lane === "wire");
    expect(retry).toBeLessThan(timeout);
    expect(timeout).toBeLessThan(wire);
    // HTTP: NDJSON lines, then the done line
    const lines = journey.steps.filter((step) => step.lane === "wire" && step.direction === "up" && step.item !== undefined);
    expect(lines.map((step) => JSON.parse(step.detail ?? "{}").type)).toEqual(["item", "item", "item"]);
    expect(journey.steps.some((step) => step.detail === JSON.stringify({ type: "done" }))).toBe(true);
  });

  it("opens a span for each nested call, with the span of its parent", async () => {
    const journey = await runJourney("websocket");
    const spans = journey.steps.filter((step) => step.lane === "nested" && step.direction === "down");
    expect(spans).toHaveLength(2);
    // W3C span ids: 16 hex digits (roadmap R16)
    for (const span of spans) expect(span.detail).toMatch(/parent [0-9a-f]{16}/);
  });

  it("has no interceptor in process: LocalTransport calls invokeProcedure with none", async () => {
    const journey = await runJourney("local");
    expect(journey.steps.some((step) => step.lane === "interceptor")).toBe(false);
  });

  it("sends one progress notification for each item over MCP, then the result", async () => {
    const journey = await runJourney("mcp");
    const notes = journey.steps.filter((step) => step.lane === "wire" && step.detail?.includes("notifications/progress"));
    expect(notes).toHaveLength(3);
    const result = journey.steps.at(-2)!;
    expect(JSON.parse(result.detail ?? "{}").result.content).toHaveLength(3);
  });

  it("records an input that is not valid, and the app gets the error", async () => {
    const journey = await runJourney("http", { prices: [], taxRate: 0.1 });
    expect(journey.ok).toBe(false);
    expect(journey.steps.some((step) => step.lane === "validation" && step.title.includes("not valid"))).toBe(true);
    expect(journey.steps.some((step) => step.lane === "handler")).toBe(false);
  });
});
