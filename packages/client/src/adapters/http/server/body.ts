/**
 * The JSON body of an HTTP request, read to a limit. The procedure handler and the MCP face of a
 * host (CLI-35) read a body with this one function.
 */

import type { IncomingMessage } from "node:http";

/** The error of a request body or of a header that a handler cannot read: too large (413), not JSON (400), a header too long (431). */
export class BodyError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "BodyError";
  }
}

/**
 * This function reads the JSON body of a request to a limit of bytes. A body parser of a framework
 * (`express.json({ strict: false })`) gives `req.body`: then the function gives it as it is. A GET,
 * a HEAD, a body that was read before, and an empty body give undefined.
 */
export async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const parsed = (req as { body?: unknown }).body;
  if (parsed !== undefined) return parsed;
  if (req.method === "GET" || req.method === "HEAD" || req.readableEnded) return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > limit) throw new BodyError(`The request body is larger than ${limit} bytes`, 413);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BodyError("The request body is not valid JSON", 400);
  }
}
