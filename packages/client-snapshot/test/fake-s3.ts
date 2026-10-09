/**
 * A fake of the `s3.*` procedures for the snapshot tests, with the objects in memory.
 *
 * `s3.list` returns the keys in the order of S3 (by key), in pages of `pageSize`. The other
 * procedures that a test does not give fail, as an unknown procedure does.
 */

import { writeFileSync } from "node:fs";
import type { ProcedureContext } from "@mark1russell7/client";

interface StoredObject {
  body: Buffer;
  lastModified: string;
}

export interface FakeS3 {
  objects: Map<string, StoredObject>;
  ctx: ProcedureContext;
  calls: string[];
  /** Replace a procedure, for a failure test. */
  override(path: string, handler: (input: Record<string, unknown>) => unknown): void;
}

export function fakeS3(pageSize = 1000): FakeS3 {
  const objects = new Map<string, StoredObject>();
  const uploads = new Map<string, Map<number, Buffer>>();
  const calls: string[] = [];
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const now = () => new Date((clock += 1000)).toISOString();

  const handlers: Record<string, (input: Record<string, unknown>) => unknown> = {
    "s3.upload": ({ key, body, base64 }) => {
      const bytes = base64 ? Buffer.from(body as string, "base64") : Buffer.from(body as string, "utf8");
      objects.set(key as string, { body: bytes, lastModified: now() });
      return { key, etag: "e" };
    },
    "s3.download": ({ key, encoding, destPath }) => {
      const object = objects.get(key as string);
      if (!object) throw new Error(`NoSuchKey: ${String(key)}`);
      if (destPath) {
        writeFileSync(destPath as string, object.body);
        return { body: "", path: destPath, contentLength: object.body.length };
      }
      return { body: object.body.toString((encoding as BufferEncoding | undefined) ?? "base64") };
    },
    "s3.list": ({ prefix, maxKeys, continuationToken }) => {
      const keys = [...objects.keys()].filter((key) => key.startsWith((prefix as string | undefined) ?? "")).sort();
      const start = continuationToken ? Number(continuationToken) : 0;
      const size = Math.min((maxKeys as number | undefined) ?? 1000, pageSize);
      const page = keys.slice(start, start + size);
      const truncated = start + size < keys.length;
      return {
        contents: page.map((key) => ({
          key,
          size: objects.get(key)!.body.length,
          lastModified: objects.get(key)!.lastModified,
        })),
        keyCount: page.length,
        isTruncated: truncated,
        ...(truncated ? { nextContinuationToken: String(start + size) } : {}),
      };
    },
    "s3.delete": ({ keys }) => {
      for (const key of keys as string[]) objects.delete(key);
      return { deleted: keys };
    },
    "s3.multipart.init": ({ key }) => {
      const uploadId = `upload-${String(key)}`;
      uploads.set(uploadId, new Map());
      return { uploadId };
    },
    "s3.multipart.upload": ({ uploadId, partNumber, body }) => {
      uploads.get(uploadId as string)!.set(partNumber as number, Buffer.from(body as string, "base64"));
      return { etag: `p${String(partNumber)}`, partNumber };
    },
    "s3.multipart.complete": ({ uploadId, key, parts }) => {
      const stored = uploads.get(uploadId as string)!;
      const ordered = (parts as Array<{ partNumber: number }>).map((part) => stored.get(part.partNumber)!);
      objects.set(key as string, { body: Buffer.concat(ordered), lastModified: now() });
      uploads.delete(uploadId as string);
      return { key };
    },
    "s3.multipart.abort": ({ uploadId }) => {
      uploads.delete(uploadId as string);
      return { aborted: true };
    },
  };

  const call = async (path: string[], input: Record<string, unknown>) => {
    const name = path.join(".");
    calls.push(name);
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler registered: ${name}`);
    return handler(input);
  };

  return {
    objects,
    calls,
    ctx: { client: { call } } as unknown as ProcedureContext,
    override(path, handler) {
      handlers[path] = handler;
    },
  };
}
