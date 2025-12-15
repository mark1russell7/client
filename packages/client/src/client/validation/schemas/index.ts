/**
 * Validation Schemas
 *
 * Generic schemas for transport and message formats.
 */

// Transport-level schemas (HTTP)
export {
  createHttpRequestSchema,
  createHttpResponseSchema,
  type HttpMethod,
  type HttpRequest,
  type HttpResponse,
  type ZodModule,
  type ExtractBody,
} from "./transport.js";

// Universal message schemas
export {
  createMethodSchema,
  createMetadataSchema,
  createMessageSchema,
  createStatusSchema,
  createResponseItemSchema,
  type MethodShape,
  type MessageShape,
  type StatusShape,
  type ResponseItemShape,
  type ExtractPayload,
} from "./message.js";
