/**
 * The environment carrier of the trace context (roadmap item C10 of otel-ts). A program that
 * starts `mark` can give it the context of its trace in the environment variables `TRACEPARENT`,
 * `TRACESTATE` and `BAGGAGE`, as the OpenTelemetry specification of the environment carriers
 * tells. `mark` sends them with its call as the metadata keys `traceparent`, `tracestate` and
 * `baggage`. The host of the call makes the remote span the parent of the call. The call of
 * `mark` is a local or a token call, so the host uses its baggage too.
 */

/** The environment variables of the carrier and their metadata keys */
const CARRIER_KEYS = [
  ["TRACEPARENT", "traceparent"],
  ["TRACESTATE", "tracestate"],
  ["BAGGAGE", "baggage"],
] as const;

/**
 * This function gives the metadata of the trace context in `env`: one key for each variable of
 * the carrier that has a value. An empty variable gives no key.
 */
export function traceCarrierMetadata(env: Readonly<Record<string, string | undefined>> = process.env): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [variable, key] of CARRIER_KEYS) {
    const value = env[variable];
    if (value !== undefined && value.trim() !== "") metadata[key] = value.trim();
  }
  return metadata;
}
