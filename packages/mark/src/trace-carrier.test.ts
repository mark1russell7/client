/**
 * The environment carrier of the trace context (roadmap item C10 of otel-ts): `TRACEPARENT`,
 * `TRACESTATE` and `BAGGAGE` become the metadata keys of the call of `mark`.
 */

import { describe, it, expect } from "vitest";
import { traceCarrierMetadata } from "./trace-carrier.js";

describe("traceCarrierMetadata (C10)", () => {
  it("gives one metadata key for each variable of the carrier", () => {
    const env = { TRACEPARENT: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", TRACESTATE: "vendor=1", BAGGAGE: "tenant=acme", PATH: "/bin" };
    expect(traceCarrierMetadata(env)).toEqual({
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      tracestate: "vendor=1",
      baggage: "tenant=acme",
    });
  });

  it("gives no key for a variable that is missing or empty", () => {
    expect(traceCarrierMetadata({})).toEqual({});
    expect(traceCarrierMetadata({ TRACEPARENT: "  ", BAGGAGE: " tenant=acme " })).toEqual({ baggage: "tenant=acme" });
  });
});
