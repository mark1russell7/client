// The root registers nothing: import "<package>/register", or give the module to createRegistry()
export * from "./module.js";
export * from "./types.js";
export { httpRequest, httpJson, httpNdjson, httpSse } from "./procedures/http/index.js";
// The host policy (roadmap R38)
export { HOST_NOT_ALLOWED, DEFAULT_HOST_POLICY, createHostPolicy, checkHost, isHostNotAllowed, systemResolver } from "./policy.js";
// A fetch for GET requests through the host policy, for the procedures of other packages (O55)
export { createHostFetch, type HostFetch, type HostFetchInit, type HostFetchResponse } from "./host-fetch.js";
export type { AllowedTarget, HostPolicy, HostPolicyOptions, HostResolver, ResolvedAddress } from "./policy.js";
export { isPublicAddress, parseAddress, specialClass } from "./address.js";
export { HttpError, type HttpErrorCode } from "./errors.js";
export { DEFAULT_MAX_BYTES, DEFAULT_ITEM_BYTES, DEFAULT_TIMEOUT_MS, DEFAULT_SETTINGS, type HttpSettings } from "./exchange.js";
export { ndjsonLines, sseEvents, type NdjsonLine, type ServerSentEvent } from "./parsers.js";
