/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for S3 operations
 *
 * Provides s3.upload, s3.download, s3.list, s3.delete, and s3.multipart.* procedures.
 * Credentials are loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 */

import { createProcedure, zodAdapter, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import {
  s3Upload,
  s3Download,
  s3List,
  s3ListAll,
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
  S3ListAllInputSchema,
  S3DeleteInputSchema,
  S3MultipartInitInputSchema,
  S3MultipartUploadInputSchema,
  S3MultipartCompleteInputSchema,
  S3MultipartAbortInputSchema,
  type S3UploadInput,
  type S3DownloadInput,
  type S3ListInput,
  type S3ListAllInput,
  type S3DeleteInput,
  type S3MultipartInitInput,
  type S3MultipartUploadInput,
  type S3MultipartCompleteInput,
  type S3MultipartAbortInput,
  type S3UploadOutput,
  type S3DownloadOutput,
  type S3ListOutput,
  type S3ListAllOutput,
  type S3DeleteOutput,
  type S3MultipartInitOutput,
  type S3MultipartUploadOutput,
  type S3MultipartCompleteOutput,
  type S3MultipartAbortOutput,
  S3UploadOutputSchema,
  S3DownloadOutputSchema,
  S3ListOutputSchema,
  S3ListAllOutputSchema,
  S3DeleteOutputSchema,
  S3MultipartInitOutputSchema,
  S3MultipartUploadOutputSchema,
  S3MultipartCompleteOutputSchema,
  S3MultipartAbortOutputSchema,
} from "./types.js";

// =============================================================================
// Procedures
// =============================================================================

const s3UploadProcedure = createProcedure()
  .path(["s3", "upload"])
  .input(zodAdapter<S3UploadInput>(S3UploadInputSchema))
  .output(zodAdapter<S3UploadOutput>(S3UploadOutputSchema))
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
  .output(zodAdapter<S3DownloadOutput>(S3DownloadOutputSchema))
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
  .output(zodAdapter<S3ListOutput>(S3ListOutputSchema))
  .meta({
    description: "List objects in S3 bucket",
    shorts: { bucket: "b", prefix: "p", maxKeys: "n" },
    output: "json",
  })
  .handler(async (input: S3ListInput): Promise<S3ListOutput> => {
    return s3List(input);
  })
  .build();

const s3ListAllProcedure = createProcedure()
  .path(["s3", "listAll"])
  .input(zodAdapter<S3ListAllInput>(S3ListAllInputSchema))
  .output(zodAdapter<S3ListAllOutput>(S3ListAllOutputSchema))
  .meta({
    description: "List ALL objects in S3 bucket, following continuation tokens (unbounded by 1000)",
    shorts: { bucket: "b", prefix: "p", maxKeys: "n" },
    output: "json",
  })
  .handler(async (input: S3ListAllInput): Promise<S3ListAllOutput> => {
    return s3ListAll(input);
  })
  .build();

const s3DeleteProcedure = createProcedure()
  .path(["s3", "delete"])
  .input(zodAdapter<S3DeleteInput>(S3DeleteInputSchema))
  .output(zodAdapter<S3DeleteOutput>(S3DeleteOutputSchema))
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
  .output(zodAdapter<S3MultipartInitOutput>(S3MultipartInitOutputSchema))
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
  .output(zodAdapter<S3MultipartUploadOutput>(S3MultipartUploadOutputSchema))
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
  .output(zodAdapter<S3MultipartCompleteOutput>(S3MultipartCompleteOutputSchema))
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
  .output(zodAdapter<S3MultipartAbortOutput>(S3MultipartAbortOutputSchema))
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

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const s3Module: ProcedureModule = defineModule("@procedures/s3", [
    s3UploadProcedure,
    s3DownloadProcedure,
    s3ListProcedure,
    s3ListAllProcedure,
    s3DeleteProcedure,
    s3MultipartInitProcedure,
    s3MultipartUploadProcedure,
    s3MultipartCompleteProcedure,
    s3MultipartAbortProcedure,
  ]);

export default s3Module;

/**
 * This function registers the procedures of @procedures/s3, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerS3Procedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [s3Module]);
}
