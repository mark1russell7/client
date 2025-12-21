/**
 * Procedure Registration for S3 operations
 *
 * Provides s3.upload, s3.download, s3.list, s3.delete, and s3.multipart.* procedures.
 * Credentials are loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import {
  s3Upload,
  s3Download,
  s3List,
  s3Delete,
  s3MultipartInit,
  s3MultipartUpload,
  s3MultipartComplete,
  s3MultipartAbort,
} from "./procedures/s3/index.js";
import {
  S3UploadInputSchema,
  S3DownloadInputSchema,
  S3ListInputSchema,
  S3DeleteInputSchema,
  S3MultipartInitInputSchema,
  S3MultipartUploadInputSchema,
  S3MultipartCompleteInputSchema,
  S3MultipartAbortInputSchema,
  type S3UploadInput,
  type S3DownloadInput,
  type S3ListInput,
  type S3DeleteInput,
  type S3MultipartInitInput,
  type S3MultipartUploadInput,
  type S3MultipartCompleteInput,
  type S3MultipartAbortInput,
  type S3UploadOutput,
  type S3DownloadOutput,
  type S3ListOutput,
  type S3DeleteOutput,
  type S3MultipartInitOutput,
  type S3MultipartUploadOutput,
  type S3MultipartCompleteOutput,
  type S3MultipartAbortOutput,
} from "./types.js";

// =============================================================================
// Minimal Schema Adapter
// =============================================================================

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

// =============================================================================
// Procedures
// =============================================================================

const s3UploadProcedure = createProcedure()
  .path(["s3", "upload"])
  .input(zodAdapter<S3UploadInput>(S3UploadInputSchema))
  .output(outputSchema<S3UploadOutput>())
  .meta({
    description: "Upload content to S3 bucket",
    shorts: { bucket: "b", key: "k" },
    output: "json",
  })
  .handler(async (input: S3UploadInput): Promise<S3UploadOutput> => {
    return s3Upload(input);
  })
  .build();

const s3DownloadProcedure = createProcedure()
  .path(["s3", "download"])
  .input(zodAdapter<S3DownloadInput>(S3DownloadInputSchema))
  .output(outputSchema<S3DownloadOutput>())
  .meta({
    description: "Download content from S3 bucket",
    shorts: { bucket: "b", key: "k", encoding: "e" },
    output: "json",
  })
  .handler(async (input: S3DownloadInput): Promise<S3DownloadOutput> => {
    return s3Download(input);
  })
  .build();

const s3ListProcedure = createProcedure()
  .path(["s3", "list"])
  .input(zodAdapter<S3ListInput>(S3ListInputSchema))
  .output(outputSchema<S3ListOutput>())
  .meta({
    description: "List objects in S3 bucket",
    shorts: { bucket: "b", prefix: "p", maxKeys: "n" },
    output: "json",
  })
  .handler(async (input: S3ListInput): Promise<S3ListOutput> => {
    return s3List(input);
  })
  .build();

const s3DeleteProcedure = createProcedure()
  .path(["s3", "delete"])
  .input(zodAdapter<S3DeleteInput>(S3DeleteInputSchema))
  .output(outputSchema<S3DeleteOutput>())
  .meta({
    description: "Delete object from S3 bucket",
    shorts: { bucket: "b", key: "k" },
    output: "json",
  })
  .handler(async (input: S3DeleteInput): Promise<S3DeleteOutput> => {
    return s3Delete(input);
  })
  .build();

const s3MultipartInitProcedure = createProcedure()
  .path(["s3", "multipart", "init"])
  .input(zodAdapter<S3MultipartInitInput>(S3MultipartInitInputSchema))
  .output(outputSchema<S3MultipartInitOutput>())
  .meta({
    description: "Initialize multipart upload for large files",
    shorts: { bucket: "b", key: "k" },
    output: "json",
  })
  .handler(async (input: S3MultipartInitInput): Promise<S3MultipartInitOutput> => {
    return s3MultipartInit(input);
  })
  .build();

const s3MultipartUploadProcedure = createProcedure()
  .path(["s3", "multipart", "upload"])
  .input(zodAdapter<S3MultipartUploadInput>(S3MultipartUploadInputSchema))
  .output(outputSchema<S3MultipartUploadOutput>())
  .meta({
    description: "Upload a part in multipart upload",
    shorts: { bucket: "b", key: "k", partNumber: "n" },
    output: "json",
  })
  .handler(async (input: S3MultipartUploadInput): Promise<S3MultipartUploadOutput> => {
    return s3MultipartUpload(input);
  })
  .build();

const s3MultipartCompleteProcedure = createProcedure()
  .path(["s3", "multipart", "complete"])
  .input(zodAdapter<S3MultipartCompleteInput>(S3MultipartCompleteInputSchema))
  .output(outputSchema<S3MultipartCompleteOutput>())
  .meta({
    description: "Complete multipart upload by assembling parts",
    shorts: { bucket: "b", key: "k" },
    output: "json",
  })
  .handler(async (input: S3MultipartCompleteInput): Promise<S3MultipartCompleteOutput> => {
    return s3MultipartComplete(input);
  })
  .build();

const s3MultipartAbortProcedure = createProcedure()
  .path(["s3", "multipart", "abort"])
  .input(zodAdapter<S3MultipartAbortInput>(S3MultipartAbortInputSchema))
  .output(outputSchema<S3MultipartAbortOutput>())
  .meta({
    description: "Abort multipart upload and clean up parts",
    shorts: { bucket: "b", key: "k" },
    output: "json",
  })
  .handler(async (input: S3MultipartAbortInput): Promise<S3MultipartAbortOutput> => {
    return s3MultipartAbort(input);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerS3Procedures(): void {
  registerProcedures([
    s3UploadProcedure,
    s3DownloadProcedure,
    s3ListProcedure,
    s3DeleteProcedure,
    s3MultipartInitProcedure,
    s3MultipartUploadProcedure,
    s3MultipartCompleteProcedure,
    s3MultipartAbortProcedure,
  ]);
}

// Auto-register
registerS3Procedures();
